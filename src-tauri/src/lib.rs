use tauri::Manager;
use window_vibrancy::{apply_mica, apply_acrylic};
use std::process::Command;
use std::fs;
use std::path::Path;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// winget Gyan.FFmpeg.Essentials 폴더 내에서 ffmpeg.exe를 재귀적으로 찾기 위한 헬퍼
fn find_ffmpeg_in_dir(dir: &Path) -> Option<String> {
    if dir.is_file() {
        if dir.file_name().and_then(|n| n.to_str()) == Some("ffmpeg.exe") {
            return Some(dir.to_string_lossy().to_string());
        }
        return None;
    }
    
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Some(found) = find_ffmpeg_in_dir(&entry.path()) {
                return Some(found);
            }
        }
    }
    None
}

// winget으로 설치한 FFmpeg 경로를 동적으로 확인하는 헬퍼
fn find_winget_ffmpeg() -> Option<String> {
    let local_appdata = std::env::var("LOCALAPPDATA").ok()?;
    let packages_dir = Path::new(&local_appdata).join("Microsoft").join("WinGet").join("Packages");
    
    if let Ok(entries) = fs::read_dir(packages_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("Gyan.FFmpeg.Essentials") {
                    if let Some(ffmpeg_bin) = find_ffmpeg_in_dir(&path) {
                        return Some(ffmpeg_bin);
                    }
                }
            }
        }
    }
    None
}

// 내장 사이드카 FFmpeg 바이너리 경로를 탐색하는 헬퍼
fn get_ffmpeg_sidecar_path(app_handle: &tauri::AppHandle) -> Option<String> {
    // 1. Tauri 리소스 폴더 경로 확인 (패키징된 런타임 환경)
    if let Ok(res_path) = app_handle.path().resolve("binaries/ffmpeg-x86_64-pc-windows-msvc.exe", tauri::path::BaseDirectory::Resource) {
        if res_path.exists() {
            return Some(res_path.to_string_lossy().to_string());
        }
    }
    
    // 2. 실행 프로세스 기준 상대 경로 탐색 (로컬 디버그/임시 기동 환경)
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let path1 = exe_dir.join("binaries").join("ffmpeg-x86_64-pc-windows-msvc.exe");
            if path1.exists() {
                return Some(path1.to_string_lossy().to_string());
            }
            let path2 = exe_dir.join("resources").join("binaries").join("ffmpeg-x86_64-pc-windows-msvc.exe");
            if path2.exists() {
                return Some(path2.to_string_lossy().to_string());
            }
        }
    }

    // 3. 작업 디렉터리 기준 탐색
    let path3 = Path::new("binaries").join("ffmpeg-x86_64-pc-windows-msvc.exe");
    if path3.exists() {
        return Some(path3.to_string_lossy().to_string());
    }
    let path4 = Path::new("src-tauri").join("binaries").join("ffmpeg-x86_64-pc-windows-msvc.exe");
    if path4.exists() {
        return Some(path4.to_string_lossy().to_string());
    }

    None
}

// FFmpeg 실행 경로 결정 (내장 사이드카 -> 글로벌 설치 -> winget 설치 -> 기본값)
fn get_ffmpeg_path(app_handle: &tauri::AppHandle) -> String {
    if let Some(sidecar_path) = get_ffmpeg_sidecar_path(app_handle) {
        sidecar_path
    } else if Command::new("ffmpeg").arg("-version").output().is_ok() {
        "ffmpeg".to_string()
    } else if let Some(path) = find_winget_ffmpeg() {
        path
    } else {
        "ffmpeg".to_string() // 최후의 수단
    }
}

// 파일 크기를 바이트 단위로 가져오는 커맨드
#[tauri::command]
async fn get_file_size(path: String) -> Result<u64, String> {
    fs::metadata(path)
        .map(|meta| meta.len())
        .map_err(|e| e.to_string())
}

// atempo 오디오 속도 필터 체이닝 헬퍼 (0.5~2.0 한계 보정)
fn build_atempo_filter(speed: f64) -> String {
    let mut current_speed = speed;
    let mut filters = Vec::new();
    
    while current_speed > 2.0 {
        filters.push("atempo=2.0".to_string());
        current_speed /= 2.0;
    }
    while current_speed < 0.5 {
        filters.push("atempo=0.5".to_string());
        current_speed /= 0.5;
    }
    filters.push(format!("atempo={:.4}", current_speed));
    filters.join(",")
}

// 비디오를 자르고 인코딩하여 저장하는 커맨드 (용량 압축 CRF 설정, 크롭 좌표, 배속 및 copy 최적화 포함)
#[tauri::command]
async fn export_video(
    app_handle: tauri::AppHandle,
    input_path: String,
    output_path: String,
    start_time: f64,
    end_time: f64,
    fps: String,
    use_copy: bool,
    crf: Option<u8>,
    crop_x: Option<u32>,
    crop_y: Option<u32>,
    crop_w: Option<u32>,
    crop_h: Option<u32>,
    export_speed: Option<f64>,
    is_muted: Option<bool>,
) -> Result<String, String> {
    let ffmpeg = get_ffmpeg_path(&app_handle);
    let start_str = format!("{:.3}", start_time);
    let duration_str = format!("{:.3}", end_time - start_time);

    let speed = export_speed.unwrap_or(1.0);
    let is_speed_changed = (speed - 1.0).abs() > 0.01;
    let muted = is_muted.unwrap_or(false);

    // 배속 변경 또는 음소거 설정 시 스트림 복제 사용 불가 (재인코딩 필요)
    let actual_use_copy = use_copy && !is_speed_changed && !muted;

    let mut cmd = Command::new(&ffmpeg);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    cmd.arg("-y"); // 덮어쓰기 허용

    cmd.arg("-ss").arg(&start_str);
    cmd.arg("-t").arg(&duration_str);
    cmd.arg("-i").arg(&input_path);

    if actual_use_copy {
        // 원본 유지 + 초고속 무손실 스트림 복제
        cmd.arg("-c").arg("copy");
    } else {
        // 비디오/오디오 재인코딩 수행 (압축, FPS 변경, 크롭, 배속 변경, 음소거)
        if fps != "original" {
            cmd.arg("-r").arg(&fps);
        }
        cmd.arg("-c:v").arg("libx264");
        
        // 음소거 선택 시 오디오 트랙 완전 제거 (-an), 아닐 경우 AAC 인코딩
        if muted {
            cmd.arg("-an");
        } else {
            cmd.arg("-c:a").arg("aac");
            if is_speed_changed {
                cmd.arg("-af").arg(build_atempo_filter(speed));
            }
        }
        
        // 비디오 필터 (-vf)
        let mut vf_filters = Vec::new();
        if let (Some(x), Some(y), Some(w), Some(h)) = (crop_x, crop_y, crop_w, crop_h) {
            vf_filters.push(format!("crop={}:{}:{}:{}", w, h, x, y));
        }
        if is_speed_changed {
            let pts_mult = 1.0 / speed;
            vf_filters.push(format!("setpts={:.4}*PTS", pts_mult));
        }
        if !vf_filters.is_empty() {
            cmd.arg("-vf").arg(vf_filters.join(","));
        }


        // CRF 압축률 결정 (기본값 23)
        let crf_val = crf.unwrap_or(23);
        cmd.arg("-crf").arg(crf_val.to_string());
        cmd.arg("-preset").arg("fast");
    }

    cmd.arg(&output_path);

    let output = cmd.output();

    match output {
        Ok(out) => {
            if out.status.success() {
                Ok("Success".to_string())
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                Err(format!("FFmpeg 작업 실패: {}", stderr))
            }
        }
        Err(e) => Err(format!("FFmpeg 실행 실패 (패스 확인 필요: {}): {}", ffmpeg, e)),
    }
}

// 프레임 캡처 이미지 데이터를 수신하여 로컬 파일로 저장하는 커맨드
#[tauri::command]
async fn save_frame(output_path: String, bytes: Vec<u8>) -> Result<(), String> {
    fs::write(output_path, bytes).map_err(|e| e.to_string())
}

// 윈도우 파일 연결(더블클릭)로 프로그램을 실행했을 때 넘어온 파일 경로를 확인하는 커맨드
#[tauri::command]
fn get_startup_file() -> Option<String> {
    // 0번째 인자는 실행 파일의 경로이므로, 1번째 인자를 확인합니다.
    if let Some(arg) = std::env::args().nth(1) {
        if Path::new(&arg).exists() {
            return Some(arg);
        }
    }
    None
}

// 부모 디렉터리 내에 존재하는 지원 미디어(비디오 & 이미지) 파일들을 정렬하여 수집하는 커맨드
#[tauri::command]
async fn get_neighbor_files(current_path: String) -> Result<Vec<String>, String> {
    let path = Path::new(&current_path);
    let parent = path.parent().ok_or_else(|| "부모 디렉터리가 존재하지 않습니다.".to_string())?;
    let mut files = Vec::new();
    
    // 지원하는 미디어 확장자 목록
    let supported_extensions = [
        "mp4", "webm", "mkv", "avi", "mov", "ogv", "3gp", // 비디오
        "png", "jpg", "jpeg", "webp", "gif", "bmp"         // 이미지
    ];
    
    if let Ok(entries) = fs::read_dir(parent) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_file() {
                if let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if supported_extensions.contains(&ext_lower.as_str()) {
                        if let Some(path_str) = entry_path.to_str() {
                            files.push(path_str.to_string());
                        }
                    }
                }
            }
        }
    }
    
    // 파일 수정 시간 기준 내림차순(가장 최근에 수정된 파일이 앞쪽으로) 정렬
    files.sort_by(|a, b| {
        let meta_a = fs::metadata(a).and_then(|m| m.modified());
        let meta_b = fs::metadata(b).and_then(|m| m.modified());
        
        match (meta_a, meta_b) {
            (Ok(time_a), Ok(time_b)) => {
                // 내림차순: 최신 수정일 파일이 인덱스 앞쪽에 위치
                time_b.cmp(&time_a)
            }
            (Ok(_), Err(_)) => std::cmp::Ordering::Less,
            (Err(_), Ok(_)) => std::cmp::Ordering::Greater,
            (Err(_), Err(_)) => std::cmp::Ordering::Equal,
        }
    });
    Ok(files)
}

// 이미지를 크롭하여 지정한 출력 경로에 쓰는 커맨드 (FFmpeg의 crop 필터 활용)
#[tauri::command]
async fn export_image(
    app_handle: tauri::AppHandle,
    input_path: String,
    output_path: String,
    crop_x: Option<u32>,
    crop_y: Option<u32>,
    crop_w: Option<u32>,
    crop_h: Option<u32>,
) -> Result<String, String> {
    let ffmpeg = get_ffmpeg_path(&app_handle);
    let mut cmd = Command::new(&ffmpeg);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    cmd.arg("-y");
    cmd.arg("-i").arg(&input_path);
    
    if let (Some(x), Some(y), Some(w), Some(h)) = (crop_x, crop_y, crop_w, crop_h) {
        cmd.arg("-vf").arg(format!("crop={}:{}:{}:{}", w, h, x, y));
    }
    
    cmd.arg(&output_path);
    let output = cmd.output();
    
    match output {
        Ok(out) => {
            if out.status.success() {
                Ok("Success".to_string())
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                Err(format!("FFmpeg 이미지 처리 실패: {}", stderr))
            }
        }
        Err(e) => Err(format!("FFmpeg 실행 실패: {}", e)),
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "windows")]
            {
                if let Err(_) = apply_mica(&window, None) {
                    let _ = apply_acrylic(&window, Some((20, 20, 20, 120)));
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet, 
            get_file_size, 
            export_video, 
            save_frame,
            get_startup_file,
            get_neighbor_files,
            export_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
