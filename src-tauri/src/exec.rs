//! exec.rs
//! 개발용 에디터 모듈을 위한 외부 명령 실행.
//!
//! 두 가지를 제공한다:
//!  - run_build: 빌드 명령을 실행하고 출력을 캡처해 돌려준다(내부 콘솔 표시용).
//!  - run_in_terminal: 실행 명령을 새 터미널 창에서 띄운다(표준 입출력 지원).
//!
//! 보안: 작업 디렉토리를 데이터 루트의 code/<project> 하위로 제한하고,
//! 호출은 사용자의 명시적 버튼으로만 일어난다.

use std::process::Command;
use crate::paths;

#[derive(serde::Serialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

/// 빌드 명령 실행(출력 캡처). program/args 분리.
#[tauri::command]
pub fn run_build(
    app: tauri::AppHandle,
    project: String,
    program: String,
    args: Vec<String>,
) -> Result<ExecResult, String> {
    let workdir = paths::data_root(&app).join("code").join(&project);
    if !workdir.exists() { return Err("프로젝트 폴더가 없습니다".into()); }

    let output = Command::new(&program)
        .args(&args)
        .current_dir(&workdir)
        .output()
        .map_err(|e| format!("{program} 실행 실패: {e} (실행 환경이 설치되어 있는지 확인하세요)"))?;

    Ok(ExecResult {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        code: output.status.code().unwrap_or(-1),
    })
}

/// 실행 명령을 새 터미널 창에서 띄운다(표준 입출력 가능).
/// cmd_line은 셸에서 실행할 전체 명령 문자열.
#[tauri::command]
pub fn run_in_terminal(
    app: tauri::AppHandle,
    project: String,
    cmd_line: String,
) -> Result<(), String> {
    let workdir = paths::data_root(&app).join("code").join(&project);
    if !workdir.exists() { return Err("프로젝트 폴더가 없습니다".into()); }
    let dir = workdir.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        // 새 cmd 창을 열고, 실행 후 결과를 볼 수 있도록 pause로 유지.
        // start "" cmd /k "cd /d <dir> && <cmd> & pause"
        let full = format!("cd /d \"{dir}\" && {cmd_line} & pause");
        Command::new("cmd")
            .args(["/c", "start", "", "cmd", "/k", &full])
            .spawn()
            .map_err(|e| format!("터미널 실행 실패: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        // 흔한 터미널 에뮬레이터를 순서대로 시도.
        let bash = format!("cd '{dir}' && {cmd_line}; echo; echo '[엔터를 누르면 닫힙니다]'; read");
        let terminals: &[(&str, Vec<&str>)] = &[
            ("x-terminal-emulator", vec!["-e", "bash", "-c", &bash]),
            ("gnome-terminal", vec!["--", "bash", "-c", &bash]),
            ("konsole", vec!["-e", "bash", "-c", &bash]),
            ("xterm", vec!["-e", "bash", "-c", &bash]),
        ];
        let mut ok = false;
        for (term, targs) in terminals {
            if Command::new(term).args(targs).current_dir(&workdir).spawn().is_ok() { ok = true; break; }
        }
        if !ok { return Err("터미널 에뮬레이터를 찾을 수 없습니다".into()); }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    { return Err("이 OS에서는 터미널 실행을 지원하지 않습니다".into()); }

    Ok(())
}
