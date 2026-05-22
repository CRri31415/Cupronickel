//! paths.rs
//! 쿠프로니켈의 폴더 구조를 한곳에서 관리한다.
//!
//! 설치 위치(Program Files\Cupronickel)는 읽기 전용일 수 있으므로,
//! 사용자가 만드는 데이터(노트/카드/설정 등)는 쓰기 가능한 데이터 루트에 둔다.
//! 데이터 루트 하위 구조는 기획서의 폴더 명세를 그대로 따른다.
//!
//!   <data_root>/
//!     app/       설정, 리소스, 메인화면 위젯 설정 등 코어 구동 파일
//!     note/      노트 모듈
//!     card/      암기 모듈
//!     memo/      메모 모듈
//!     calendar/  달력 모듈
//!     code/      텍스트 에디터 모듈
//!     graph/     그래프 다이어그램 모듈
//!     sheet/     시트 모듈
//!     module/    미설치 모듈의 압축파일 보관소

use std::fs;
use std::path::{Path, PathBuf};

/// 기획서에 명시된 하위 폴더 이름들.
pub const SUBDIRS: [&str; 9] = [
    "app", "note", "card", "memo", "calendar", "code", "graph", "sheet", "module",
];

/// 데이터 루트 경로를 반환한다.
/// Tauri의 app_data_dir(보통 %APPDATA%\org.cupronickel.app) 아래 Cupronickel 폴더를 쓴다.
/// Program Files는 권한 문제가 잦으므로 데이터는 여기 둔다.
pub fn data_root(app: &tauri::AppHandle) -> PathBuf {
    let base = app
        .path_resolver()
        .app_data_dir()
        .expect("앱 데이터 디렉토리를 찾을 수 없습니다");
    base.join("Cupronickel")
}

/// 데이터 루트와 모든 하위 폴더가 존재하도록 보장한다. 최초 실행 시 호출.
pub fn ensure_structure(root: &Path) -> std::io::Result<()> {
    fs::create_dir_all(root)?;
    for d in SUBDIRS {
        fs::create_dir_all(root.join(d))?;
    }
    Ok(())
}

/// 모듈 키("note","card"...)에 해당하는 폴더 경로.
pub fn module_dir(root: &Path, module_key: &str) -> PathBuf {
    root.join(module_key)
}
