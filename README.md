# Cupronickel 0.2.0-alpha

Obsidian · Anki · Geany에서 영향을 받은 모듈형 통합 생산성 소프트웨어.
**Tauri + Svelte + Vite** 기반. 오프라인 우선. Windows 대상(Ubuntu 가능).
라이선스: **GPL-2.0-only**.

이 저장소는 **코어 골격(alpha)** 입니다. 셸·테마·모듈 프레임워크·탭 영속화·메인화면/위젯·메모 모듈이 동작합니다.
나머지 모듈(노트/암기/달력/에디터/그래프/시트)은 동일한 모듈 규격 위에서 단계적으로 추가됩니다.

---

## 🟢 컴퓨터를 잘 몰라도 되는 설치 방법

설치 파일(.exe)을 얻는 방법은 두 가지입니다. **둘 중 하나만** 하면 됩니다.

### 방법 A — 내 컴퓨터에서 한 번에 만들기 (더블클릭)

1. 이 폴더 안의 **`BUILD-INSTALLER.bat`** 파일을 **더블클릭**합니다.
2. "이 앱이 변경하도록 허용하시겠어요?" 같은 관리자 창이 뜨면 **예**를 누릅니다.
3. 필요한 프로그램(Node, Rust, C++ 빌드 도구 등)이 **자동으로 설치**된 뒤,
   Cupronickel 설치 파일이 만들어지고 **그 폴더가 자동으로 열립니다.**
4. 폴더 안의 `Cupronickel_0.2.0-alpha_x64-setup.exe` 를 더블클릭하면 설치가 진행됩니다.

> 처음 한 번은 프로그램들을 받느라 몇 분 걸릴 수 있습니다.
> "방금 설치되어 아직 인식되지 않습니다"라는 안내가 나오면, 창을 닫고 `BUILD-INSTALLER.bat`를 **한 번 더** 더블클릭하세요.

### 방법 B — GitHub가 대신 만들어 주기 (내 컴퓨터에 아무것도 설치 안 함)

1. 이 프로젝트를 GitHub 저장소에 올립니다.
2. 저장소 **Actions** 탭 → **build-installer** → **Run workflow** 를 누릅니다.
3. 빌드가 끝나면 결과의 **Artifacts**에서 `Cupronickel-Windows-Installer`를 내려받습니다.
   압축을 풀면 설치 파일(.exe)이 들어 있습니다.

### 설치 파일을 실행하면

표준 설치 마법사(한국어)가 뜹니다. **다음 → 다음 → 설치**만 누르면
**`C:\Program Files\Cupronickel`** 에 설치되고 시작 메뉴에 등록됩니다.
실행에 필요한 WebView2는 Windows 11과 대부분의 Windows 10에 이미 들어 있습니다(없으면 위 빌드 과정에서 설치됨).

---

## 개발자용: 직접 실행/빌드

사전 요구사항(방법 A의 스크립트가 자동 설치하는 것과 동일): **Node.js 18+**, **Rust(rustup)**,
Windows는 **MSVC C++ Build Tools** + **WebView2**. Ubuntu는 `libwebkit2gtk-4.0-dev` 등.

```bash
npm install
npm run tauri dev      # 데스크톱 창으로 실행(핫리로드)
npm run dev            # 백엔드 없이 UI만 빠르게 보기(http://localhost:1420)
npm run tauri build    # 설치 프로그램 직접 빌드
```

빌드 산출물: Windows는 `src-tauri/target/release/bundle/nsis/*.exe`,
Ubuntu는 `bundle/deb/` 또는 `bundle/appimage/`.

---

## 의존 환경 최소화 (기획서 요구 반영)

- **WebView2(OS 내장) 사용** — Electron처럼 Chromium을 동봉하지 않습니다. 설치 파일이 작고 실행 메모리가 가볍습니다.
- **프론트엔드 런타임 라이브러리 0개** — Svelte는 빌드 시 사라지는 컴파일러입니다. 실행에 React 같은 런타임이 필요 없습니다.
- **`@tauri-apps/api` npm 의존성 제거** — `tauri.conf.json`의 `withGlobalTauri`로 내장 전역 객체만 사용합니다.
- **설치된 모듈만 로드** — 미설치 모듈 코드는 번들에서 분리되어 메모리를 점유하지 않습니다.
- 빌드용 외부 도구는 Node / Rust / MSVC / WebView2 로 한정됩니다.

---

## 보안 보완 사항 (기획서 요구: 자율 보완 후 명시)

바이브 코딩 산출물로서 형식적 보안 보장은 없으나(기획서 인정), 다음을 자율적으로 보완했습니다.

1. **경로 탈출 차단** — `src-tauri/src/storage.rs`의 `resolve_within`이 `..` 등을 정규화하여
   데이터 루트 밖 파일을 읽거나 쓰지 못하게 막습니다. (노트의 "note 폴더 밖 접근 금지" 요구의 기반)
2. **엄격한 CSP** — `default-src 'self'`로 원격 스크립트 로드를 막아 주입 공격 표면을 줄입니다. 오프라인 우선과도 일치합니다.
3. **Tauri 권한 최소화(allowlist)** — `fs.all=false`로 기본 파일 API를 끄고, 직접 만든 명령만 사용합니다.
   `path`, 파일 열기/저장 대화상자, 클립보드만 허용해 공격 표면을 줄였습니다.
4. **설치는 관리자 권한 필요** — Program Files 설치 특성상 정상 동작입니다.

---

## 데이터 폴더 구조 (런타임 생성, 앱 데이터 폴더)

```
<앱 데이터>/Cupronickel/
  app/        설정·세션·위젯·리소스
  note/ card/ memo/ calendar/ code/ graph/ sheet/   모듈별 데이터
  module/     미설치 모듈 압축 보관소
```

권한 문제를 피하기 위해 사용자 데이터는 쓰기 가능한 앱 데이터 경로에 둡니다(기획서 명시). 정책 변경은 `src-tauri/src/paths.rs` 한 곳만 수정하면 됩니다.

---

## 코드 흐름

`docs/ARCHITECTURE.md` 참고.

## 기획서에 없던 추가 사항 (명시 의무)

앱 자체 기능은 기획서에 없는 것을 추가하지 않았습니다. 빌드/배포를 위해 추가한 것:

- 원클릭 빌드 스크립트(`BUILD-INSTALLER.bat`, `build-installer.ps1`)와 CI(`.github/workflows/build-installer.yml`).
  — "AI가 설치 프로그램을 빌드해 제공" 요구를, 리눅스 환경에서 Windows .exe를 직접 못 만드는 제약 하에
  실제 설치 파일을 자동 생성하는 방법으로 충족한 것입니다.
- 합리적 기본값: 탭 유휴 전환 5분(`tabs.js`의 `IDLE_MS`), 메인 부착 메모 16개 제한(기획서 수치).
