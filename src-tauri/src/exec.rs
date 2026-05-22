//! exec.rs
//! 개발용 에디터 모듈을 위한 외부 명령 실행.
//!  - run_build: 빌드 명령 실행 + 출력 캡처(내부 콘솔용).
//!  - run_in_terminal: 실행 명령을 새 터미널 창에서 띄움(표준 입출력 지원).
//! 작업 디렉토리는 데이터 루트의 code/<project> 로 고정한다.

use std::process::Command;
use crate::paths;

#[derive(serde::Serialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

fn workdir(app: &tauri::AppHandle, project: &str) -> Result<std::path::PathBuf, String> {
    let dir = paths::data_root(app).join("code").join(project);
    if !dir.exists() { return Err(format!("프로젝트 폴더가 없습니다: {}", dir.display())); }
    Ok(dir)
}

/// 빌드 명령 실행(출력 캡처). 셸을 통해 실행하여 따옴표/연산자를 처리.
#[tauri::command]
pub fn run_build(
    app: tauri::AppHandle,
    project: String,
    cmd_line: String,
) -> Result<ExecResult, String> {
    let dir = workdir(&app, &project)?;

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut c = Command::new("cmd");
        c.args(["/c", &cmd_line]);
        c
    };
    #[cfg(not(target_os = "windows"))]
    let mut command = {
        let mut c = Command::new("sh");
        c.args(["-c", &cmd_line]);
        c
    };

    let output = command
        .current_dir(&dir)
        .output()
        .map_err(|e| format!("빌드 실행 실패: {e} (실행 환경이 설치되어 있는지 확인하세요)"))?;

    Ok(ExecResult {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        code: output.status.code().unwrap_or(-1),
    })
}

/// 실행 명령을 새 터미널 창에서 띄운다. 작업 디렉토리에서 실행되도록 보장.
#[tauri::command]
pub fn run_in_terminal(
    app: tauri::AppHandle,
    project: String,
    cmd_line: String,
) -> Result<(), String> {
    let dir = workdir(&app, &project)?;
    let dir_str = dir.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        // cmd /c start "<title>" cmd /k "..." 형태.
        // start의 첫 따옴표 인자는 '창 제목'으로 소모되므로 빈 제목("")을 반드시 준다.
        // 작업 디렉토리는 start의 /D 옵션으로 지정한다(드라이브 포함 경로 안전).
        // 실행 후 창이 닫히지 않도록 cmd /k 사용.
        let inner = format!("{cmd_line} & echo. & pause");
        Command::new("cmd")
            .args(["/c", "start", "", "/D", &dir_str, "cmd", "/k", &inner])
            .spawn()
            .map_err(|e| format!("터미널 실행 실패: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        let bash = format!("cd '{dir_str}' && {cmd_line}; echo; echo '[엔터를 누르면 닫힙니다]'; read");
        let terminals: &[(&str, Vec<&str>)] = &[
            ("x-terminal-emulator", vec!["-e", "bash", "-c", &bash]),
            ("gnome-terminal", vec!["--", "bash", "-c", &bash]),
            ("konsole", vec!["-e", "bash", "-c", &bash]),
            ("xterm", vec!["-e", "bash", "-c", &bash]),
        ];
        let mut ok = false;
        for (term, targs) in terminals {
            if Command::new(term).args(targs).current_dir(&dir).spawn().is_ok() { ok = true; break; }
        }
        if !ok { return Err("터미널 에뮬레이터를 찾을 수 없습니다".into()); }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    { return Err("이 OS에서는 터미널 실행을 지원하지 않습니다".into()); }

    Ok(())
}
