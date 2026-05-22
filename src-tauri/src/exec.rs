//! exec.rs
//! 개발용 에디터 모듈을 위한 외부 명령 실행.
//!
//! 기획서: 쿠프로니켈은 실행 환경 설치를 보장하지 않고, 사용자가 GCC/Python/GHC를
//! 설치한 뒤 `ghc --make "%f"` 같은 명령을 실행하게 한다. 여기서는 사용자가
//! 에디터에서 "빌드/실행"을 눌렀을 때만 명령을 실행하고 출력을 돌려준다.
//!
//! 보안 주의: 임의 명령 실행은 위험하므로, 작업 디렉토리를 데이터 루트의 code/ 하위로
//! 제한하고, 호출은 사용자의 명시적 행동(버튼)으로만 일어난다.

use std::process::Command;
use crate::paths;

#[derive(serde::Serialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

/// code/<project> 디렉토리에서 셸 명령을 실행한다.
/// program/args를 분리해 받아 셸 인젝션 위험을 줄인다.
#[tauri::command]
pub fn run_command(
    app: tauri::AppHandle,
    project: String,
    program: String,
    args: Vec<String>,
) -> Result<ExecResult, String> {
    let root = paths::data_root(&app);
    let workdir = root.join("code").join(&project);
    if !workdir.exists() {
        return Err("프로젝트 폴더가 없습니다".into());
    }

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
