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
    } else {
        // 글로벌 ffmpeg가 정상적으로 설치되었는지 체크할 때도 창 숨김 플래그 적용
        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-version");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000);

        if cmd.output().is_ok() {
            "ffmpeg".to_string()
        } else if let Some(path) = find_winget_ffmpeg() {
            path
        } else {
            "ffmpeg".to_string() // 최후의 수단
        }
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipSegment {
    pub id: String,
    #[serde(alias = "filePath")]
    pub file_path: String,
    pub start: f64,
    pub end: f64,
}

// ffprobe 경로 탐색 헬퍼
fn get_ffprobe_path(app_handle: &tauri::AppHandle) -> String {
    let ffmpeg = get_ffmpeg_path(app_handle);
    if ffmpeg.contains("ffmpeg") {
        let ffprobe_str = ffmpeg.replace("ffmpeg", "ffprobe");
        if Path::new(&ffprobe_str).exists() {
            return ffprobe_str;
        } else {
            // 경로 치환 후 정상 작동 여부 체크 시에도 창 숨김 플래그 적용
            let mut cmd = Command::new(&ffprobe_str);
            cmd.arg("-version");
            #[cfg(target_os = "windows")]
            cmd.creation_flags(0x08000000);

            if cmd.output().is_ok() {
                return ffprobe_str;
            }
        }
    }
    
    // 글로벌 ffprobe 존재 여부 체크 시에도 창 숨김 플래그 적용
    let mut cmd = Command::new("ffprobe");
    cmd.arg("-version");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    if cmd.output().is_ok() {
        return "ffprobe".to_string();
    }
    
    "ffprobe".to_string()
}

// 미디어 파일 오디오 스트림 보유 여부 탐색 헬퍼
fn has_audio_stream(app_handle: &tauri::AppHandle, path: &str) -> bool {
    let ffprobe = get_ffprobe_path(app_handle);
    let mut cmd = Command::new(&ffprobe);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    cmd.arg("-v")
        .arg("error")
        .arg("-select_streams")
        .arg("a")
        .arg("-show_entries")
        .arg("stream=codec_type")
        .arg("-of")
        .arg("default=noprint_wrappers=1:nokey=1")
        .arg(path);

    if let Ok(output) = cmd.output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        return stdout.trim().contains("audio");
    }
    false
}

// 비디오 파일 가로/세로 해상도 탐색 헬퍼
fn get_video_resolution(app_handle: &tauri::AppHandle, path: &str) -> (u32, u32) {
    let ffprobe = get_ffprobe_path(app_handle);
    let mut cmd = Command::new(&ffprobe);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    cmd.arg("-v")
        .arg("error")
        .arg("-select_streams")
        .arg("v:0")
        .arg("-show_entries")
        .arg("stream=width,height")
        .arg("-of")
        .arg("csv=s=x:p=0")
        .arg(path);

    if let Ok(output) = cmd.output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let parts: Vec<&str> = stdout.trim().split('x').collect();
        if parts.len() == 2 {
            let w = parts[0].parse::<u32>().unwrap_or(1920);
            let h = parts[1].parse::<u32>().unwrap_or(1080);
            return (w, h);
        }
    }
    (1920, 1080)
}

// 오디오 스트림 코덱 명칭 탐색 헬퍼 (예: mp3, aac, pcm_s16le, opus, flac 등)
fn get_audio_codec(app_handle: &tauri::AppHandle, path: &str) -> Option<String> {
    let ffprobe = get_ffprobe_path(app_handle);
    let mut cmd = Command::new(&ffprobe);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    cmd.arg("-v")
        .arg("error")
        .arg("-select_streams")
        .arg("a:0")
        .arg("-show_entries")
        .arg("stream=codec_name")
        .arg("-of")
        .arg("default=noprint_wrappers=1:nokey=1")
        .arg(path);

    if let Ok(output) = cmd.output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let codec = stdout.trim().to_lowercase();
        if !codec.is_empty() {
            return Some(codec);
        }
    }
    None
}

// 동영상 트림, 크롭, 배속 및 움짤(GIF/WebP)/오디오(MP3/M4A/WAV) 내보내기 커맨드
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
    export_type: Option<String>,
    gif_fps: Option<String>,
    gif_quality: Option<u32>,
    gif_format: Option<String>,
    audio_bitrate: Option<String>,
    audio_format: Option<String>,
    segments: Option<Vec<ClipSegment>>,
    is_flipped: Option<bool>,
) -> Result<String, String> {
    let ffmpeg = get_ffmpeg_path(&app_handle);
    let speed = export_speed.unwrap_or(1.0);
    let is_speed_changed = (speed - 1.0).abs() > 0.01;
    let muted = is_muted.unwrap_or(false);
    let exp_type = export_type.unwrap_or_else(|| "video".to_string());
    let flip_filter_str = if is_flipped.unwrap_or(false) { "hflip," } else { "" };

    let active_segments = match segments {
        Some(ref segs) if !segs.is_empty() => segs.clone(),
        _ => vec![ClipSegment {
            id: "default".to_string(),
            file_path: input_path.clone(),
            start: start_time,
            end: end_time,
        }],
    };

    let is_multi_segment = active_segments.len() > 1;

    let mut cmd = Command::new(&ffmpeg);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    cmd.arg("-y"); // 덮어쓰기 허용

    if exp_type == "gif" {
        // [움짤(GIF/WebP) 내보내기]
        let gif_f = gif_format.unwrap_or_else(|| "gif".to_string());
        let fps_val = gif_fps.unwrap_or_else(|| "15".to_string());
        let quality_val = gif_quality.unwrap_or(100);
        let scale_ratio = (quality_val as f64) / 100.0;

        // 짝수 픽셀 해상도 보장 스케일 필터 (trunc(iw*ratio/2)*2)
        let scale_filter = format!("scale='trunc(iw*{:.4}/2)*2':'trunc(ih*{:.4}/2)*2'", scale_ratio, scale_ratio);

        let crop_filter_str = if let (Some(x), Some(y), Some(w), Some(h)) = (crop_x, crop_y, crop_w, crop_h) {
            format!("{}crop={}:{}:{}:{},", flip_filter_str, w, h, x, y)
        } else {
            flip_filter_str.to_string()
        };

        let pts_filter_str = if is_speed_changed {
            let pts_mult = 1.0 / speed;
            format!("setpts={:.4}*PTS,", pts_mult)
        } else {
            "".to_string()
        };

        if !is_multi_segment {
            let seg = &active_segments[0];
            let src_path = if seg.file_path.is_empty() { &input_path } else { &seg.file_path };
            let start_str = format!("{:.3}", seg.start);
            let duration_str = format!("{:.3}", seg.end - seg.start);

            cmd.arg("-i").arg(src_path);
            cmd.arg("-ss").arg(&start_str);
            cmd.arg("-t").arg(&duration_str);

            if gif_f == "webp" {
                cmd.arg("-vcodec").arg("libwebp");
                cmd.arg("-loop").arg("0");
                cmd.arg("-vf").arg(format!("{}{}fps={},{}", crop_filter_str, pts_filter_str, fps_val, scale_filter));
            } else {
                // GIF: 고품질 palettegen / paletteuse 적용
                let fc = format!("[0:v]{}{}fps={},{},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse", crop_filter_str, pts_filter_str, fps_val, scale_filter);
                cmd.arg("-filter_complex").arg(fc);
            }
        } else {
            // [다중 클립 타임라인 GIF/WebP 내보내기]
            let (base_w, base_h) = get_video_resolution(&app_handle, &input_path);
            let raw_w = crop_w.unwrap_or(base_w);
            let raw_h = crop_h.unwrap_or(base_h);
            let scaled_w = ((raw_w as f64) * scale_ratio) as u32;
            let scaled_h = ((raw_h as f64) * scale_ratio) as u32;
            let target_w = (scaled_w / 2) * 2;
            let target_h = (scaled_h / 2) * 2;

            let mut unique_inputs: Vec<String> = Vec::new();
            for seg in &active_segments {
                let path = if seg.file_path.is_empty() { input_path.clone() } else { seg.file_path.clone() };
                if !unique_inputs.contains(&path) {
                    unique_inputs.push(path);
                }
            }
            for input in &unique_inputs {
                cmd.arg("-i").arg(input);
            }

            let mut filter_str = String::new();
            let mut labels = String::new();
            for (idx, seg) in active_segments.iter().enumerate() {
                let path = if seg.file_path.is_empty() { input_path.clone() } else { seg.file_path.clone() };
                let input_idx = unique_inputs.iter().position(|r| r == &path).unwrap_or(0);
                let duration = (seg.end - seg.start).max(0.1);
                
                filter_str.push_str(&format!(
                    "[{}:v]trim=start={:.3}:duration={:.3},setpts=PTS-STARTPTS,{}scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2,setsar=1,{}null[v{}];",
                    input_idx, seg.start, duration, crop_filter_str, target_w, target_h, target_w, target_h, pts_filter_str, idx
                ));
                labels.push_str(&format!("[v{}]", idx));
            }
            filter_str.push_str(&format!("{}concat=n={}:v=1:a=0[vconcat];", labels, active_segments.len()));
            
            if gif_f == "webp" {
                filter_str.push_str(&format!("[vconcat]fps={}[vout]", fps_val));
                cmd.arg("-filter_complex").arg(&filter_str);
                cmd.arg("-map").arg("[vout]");
                cmd.arg("-vcodec").arg("libwebp");
                cmd.arg("-loop").arg("0");
            } else {
                filter_str.push_str(&format!("[vconcat]fps={}[vfps];[vfps]split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse[vout]", fps_val));
                cmd.arg("-filter_complex").arg(&filter_str);
                cmd.arg("-map").arg("[vout]");
            }
        }
    } else if exp_type == "audio" {
        // [오디오 내보내기]
        let target_fmt = audio_format.unwrap_or_else(|| "mp3".to_string());
        let bitrate_setting = audio_bitrate.unwrap_or_else(|| "320k".to_string());

        if !is_multi_segment {
            let seg = &active_segments[0];
            let src_path = if seg.file_path.is_empty() { &input_path } else { &seg.file_path };
            let start_str = format!("{:.3}", seg.start);
            let duration_str = format!("{:.3}", seg.end - seg.start);

            cmd.arg("-i").arg(src_path);
            cmd.arg("-ss").arg(&start_str);
            cmd.arg("-t").arg(&duration_str);
        } else {
            // 다중 클립 오디오 결합 (concat filter)
            let mut unique_inputs: Vec<String> = Vec::new();
            for seg in &active_segments {
                let path = if seg.file_path.is_empty() { input_path.clone() } else { seg.file_path.clone() };
                if !unique_inputs.contains(&path) {
                    unique_inputs.push(path);
                }
            }
            for input in &unique_inputs {
                cmd.arg("-i").arg(input);
            }

            let mut filter_str = String::new();
            let mut labels = String::new();
            for (idx, seg) in active_segments.iter().enumerate() {
                let path = if seg.file_path.is_empty() { input_path.clone() } else { seg.file_path.clone() };
                let input_idx = unique_inputs.iter().position(|r| r == &path).unwrap_or(0);
                let duration = (seg.end - seg.start).max(0.1);
                
                filter_str.push_str(&format!(
                    "[{}:a]atrim=start={:.3}:duration={:.3},asetpts=PTS-STARTPTS[a{}];",
                    input_idx, seg.start, duration, idx
                ));
                labels.push_str(&format!("[a{}]", idx));
            }
            filter_str.push_str(&format!("{}concat=n={}:v=0:a=1[aout]", labels, active_segments.len()));
            cmd.arg("-filter_complex").arg(filter_str);
            cmd.arg("-map").arg("[aout]");
        }

        cmd.arg("-vn"); // 비디오 스트림 제거

        if bitrate_setting == "original" {
            let seg = &active_segments[0];
            let src_path = if seg.file_path.is_empty() { &input_path } else { &seg.file_path };
            let in_codec = get_audio_codec(&app_handle, src_path).unwrap_or_default();
            let is_compatible = match target_fmt.as_str() {
                "mp3" => in_codec == "mp3",
                "m4a" => in_codec == "aac",
                "wav" => in_codec.starts_with("pcm"),
                _ => false,
            };

            if is_compatible && !is_speed_changed && !is_multi_segment {
                cmd.arg("-c:a").arg("copy");
            } else {
                match target_fmt.as_str() {
                    "mp3" => {
                        cmd.arg("-c:a").arg("libmp3lame").arg("-b:a").arg("320k");
                    }
                    "m4a" => {
                        cmd.arg("-c:a").arg("aac").arg("-b:a").arg("320k");
                    }
                    "wav" => {
                        cmd.arg("-c:a").arg("pcm_s16le");
                    }
                    _ => {
                        cmd.arg("-c:a").arg("libmp3lame").arg("-b:a").arg("320k");
                    }
                }
            }
        } else {
            match target_fmt.as_str() {
                "mp3" => {
                    cmd.arg("-c:a").arg("libmp3lame").arg("-b:a").arg(&bitrate_setting);
                }
                "m4a" => {
                    cmd.arg("-c:a").arg("aac").arg("-b:a").arg(&bitrate_setting);
                }
                "wav" => {
                    cmd.arg("-c:a").arg("pcm_s16le");
                }
                _ => {
                    cmd.arg("-c:a").arg("libmp3lame").arg("-b:a").arg(&bitrate_setting);
                }
            }
        }

        if is_speed_changed && !is_multi_segment {
            cmd.arg("-af").arg(build_atempo_filter(speed));
        }
    } else {
        // [일반 비디오 내보내기]
        let actual_use_copy = use_copy && !is_speed_changed && !muted && !is_multi_segment;

        if !is_multi_segment {
            let seg = &active_segments[0];
            let src_path = if seg.file_path.is_empty() { &input_path } else { &seg.file_path };
            let start_str = format!("{:.3}", seg.start);
            let duration_str = format!("{:.3}", seg.end - seg.start);
            cmd.arg("-ss").arg(&start_str);
            cmd.arg("-t").arg(&duration_str);
            cmd.arg("-i").arg(src_path);
        } else {
            let mut unique_inputs: Vec<String> = Vec::new();
            for seg in &active_segments {
                let path = if seg.file_path.is_empty() { input_path.clone() } else { seg.file_path.clone() };
                if !unique_inputs.contains(&path) {
                    unique_inputs.push(path);
                }
            }
            for input in &unique_inputs {
                cmd.arg("-i").arg(input);
            }
        }

        if actual_use_copy {
            cmd.arg("-c").arg("copy");
        } else {
            if fps != "original" {
                cmd.arg("-r").arg(&fps);
            }
            cmd.arg("-c:v").arg("libx264");

            if is_multi_segment {
                let (base_w, base_h) = get_video_resolution(&app_handle, &input_path);
                let raw_w = crop_w.unwrap_or(base_w);
                let raw_h = crop_h.unwrap_or(base_h);
                let target_w = (raw_w / 2) * 2;
                let target_h = (raw_h / 2) * 2;

                let mut unique_inputs: Vec<String> = Vec::new();
                let mut input_has_audio: Vec<bool> = Vec::new();
                for seg in &active_segments {
                    let path = if seg.file_path.is_empty() { input_path.clone() } else { seg.file_path.clone() };
                    if !unique_inputs.contains(&path) {
                        let has_a = has_audio_stream(&app_handle, &path);
                        unique_inputs.push(path);
                        input_has_audio.push(has_a);
                    }
                }

                let mut fc_parts = Vec::new();
                let count = active_segments.len();

                for (i, seg) in active_segments.iter().enumerate() {
                    let path = if seg.file_path.is_empty() { input_path.clone() } else { seg.file_path.clone() };
                    let input_idx = unique_inputs.iter().position(|p| p == &path).unwrap_or(0);
                    let start_s = format!("{:.3}", seg.start);
                    let end_s = format!("{:.3}", seg.end);
                    let dur_s = format!("{:.3}", (seg.end - seg.start).max(0.1));

                    let crop_filter = if let (Some(x), Some(y), Some(w), Some(h)) = (crop_x, crop_y, crop_w, crop_h) {
                        format!("crop={}:{}:{}:{},", w, h, x, y)
                    } else {
                        "".to_string()
                    };

                    fc_parts.push(format!(
                        "[{}:v]trim=start={}:end={},setpts=PTS-STARTPTS,{}scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2,setsar=1[v{}]",
                        input_idx, start_s, end_s, crop_filter, target_w, target_h, target_w, target_h, i
                    ));

                    if !muted {
                        if input_has_audio[input_idx] {
                            fc_parts.push(format!(
                                "[{}:a]atrim=start={}:end={},asetpts=PTS-STARTPTS[a{}]",
                                input_idx, start_s, end_s, i
                            ));
                        } else {
                            fc_parts.push(format!(
                                "anullsrc=r=48000:cl=mono,atrim=end={},asetpts=PTS-STARTPTS[a{}]",
                                dur_s, i
                            ));
                        }
                    }
                }

                let mut concat_inputs = String::new();
                for i in 0..count {
                    if !muted {
                        concat_inputs.push_str(&format!("[v{}][a{}]", i, i));
                    } else {
                        concat_inputs.push_str(&format!("[v{}]", i));
                    }
                }

                let a_opt = if muted { 0 } else { 1 };
                fc_parts.push(format!(
                    "{}concat=n={}:v=1:a={}[outv_raw]{}",
                    concat_inputs,
                    count,
                    a_opt,
                    if !muted { "[outa_raw]" } else { "" }
                ));

                let mut outv_last = "[outv_raw]".to_string();
                let mut outa_last = if !muted { "[outa_raw]".to_string() } else { "".to_string() };

                if is_speed_changed {
                    let pts_mult = 1.0 / speed;
                    let next_v = "[v_speed]".to_string();
                    fc_parts.push(format!("{}setpts={:.4}*PTS{}", outv_last, pts_mult, next_v));
                    outv_last = next_v;

                    if !muted {
                        let next_a = "[a_speed]".to_string();
                        let atempo = build_atempo_filter(speed);
                        fc_parts.push(format!("{}{}{}", outa_last, atempo, next_a));
                        outa_last = next_a;
                    }
                }

                cmd.arg("-filter_complex").arg(fc_parts.join(";"));
                cmd.arg("-map").arg(&outv_last);
                if !muted {
                    cmd.arg("-c:a").arg("aac");
                    cmd.arg("-map").arg(&outa_last);
                } else {
                    cmd.arg("-an");
                }
            } else {
                if muted {
                    cmd.arg("-an");
                } else {
                    cmd.arg("-c:a").arg("aac");
                    if is_speed_changed {
                        cmd.arg("-af").arg(build_atempo_filter(speed));
                    }
                }

                let mut vf_filters = Vec::new();
                if is_flipped.unwrap_or(false) {
                    vf_filters.push("hflip".to_string());
                }
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
            }

            let crf_val = crf.unwrap_or(23);
            cmd.arg("-crf").arg(crf_val.to_string());
            cmd.arg("-preset").arg("fast");
        }
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
    
    // 지원하는 미디어 확장자 목록 (비디오, 이미지 & 오디오)
    let supported_extensions = [
        "mp4", "webm", "mkv", "avi", "mov", "ogv", "3gp", // 비디오
        "png", "jpg", "jpeg", "webp", "gif", "bmp",        // 이미지
        "mp3", "m4a", "wav", "flac", "aac", "ogg", "opus", "wma" // 오디오
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

// 실시간 움짤(GIF/WebP) 인코딩 미리보기 생성 및 바이트 용량 반환 커맨드
#[tauri::command]
async fn generate_gif_preview(
    app_handle: tauri::AppHandle,
    input_path: String,
    start_time: f64,
    end_time: f64,
    gif_fps: String,
    gif_quality: u32,
    gif_format: String,
    crop_x: Option<u32>,
    crop_y: Option<u32>,
    crop_w: Option<u32>,
    crop_h: Option<u32>,
    export_speed: Option<f64>,
) -> Result<(String, u64), String> {
    let ffmpeg = get_ffmpeg_path(&app_handle);
    let _speed = export_speed.unwrap_or(1.0);
    
    // 미리보기 인코딩은 초고속 반응성을 위해 최대 4초로 제한
    let duration = (end_time - start_time).max(0.1).min(4.0);
    let start_str = format!("{:.3}", start_time);
    let duration_str = format!("{:.3}", duration);

    let temp_dir = std::env::temp_dir();
    let file_ext = if gif_format == "webp" { "webp" } else { "gif" };
    let temp_filename = format!("okita_preview_{}.{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis(), file_ext);
    let temp_path = temp_dir.join(temp_filename);
    let temp_path_str = temp_path.to_string_lossy().to_string();

    let scale_ratio = (gif_quality as f64) / 100.0;
    let scale_filter = format!("scale='trunc(iw*{:.4}/2)*2':'trunc(ih*{:.4}/2)*2'", scale_ratio, scale_ratio);

    let crop_filter_str = if let (Some(x), Some(y), Some(w), Some(h)) = (crop_x, crop_y, crop_w, crop_h) {
        format!("crop={}:{}:{}:{},", w, h, x, y)
    } else {
        "".to_string()
    };

    let mut cmd = Command::new(&ffmpeg);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    cmd.arg("-y");
    cmd.arg("-ss").arg(&start_str);
    cmd.arg("-t").arg(&duration_str);
    cmd.arg("-i").arg(&input_path);

    if gif_format == "webp" {
        cmd.arg("-vcodec").arg("libwebp");
        cmd.arg("-loop").arg("0");
        cmd.arg("-vf").arg(format!("{}fps={},{}", crop_filter_str, gif_fps, scale_filter));
    } else {
        let fc = format!("[0:v]{}fps={},{},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse", crop_filter_str, gif_fps, scale_filter);
        cmd.arg("-filter_complex").arg(fc);
    }

    cmd.arg(&temp_path_str);

    let output = cmd.output();
    match output {
        Ok(out) => {
            if out.status.success() {
                let size = fs::metadata(&temp_path).map(|m| m.len()).unwrap_or(0);
                Ok((temp_path_str, size))
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                Err(format!("FFmpeg 미리보기 인코딩 실패: {}", stderr))
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
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
            }

            // 기존 mica/acrylic 투명 창 설정 코드
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
