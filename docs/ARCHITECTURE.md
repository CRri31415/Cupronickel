# Cupronickel — 아키텍처 / 코드 흐름 문서

> 기획서 요구사항: "어떤 코드가 어떤 방식으로 작동하는지의 흐름을 정리한 문서를 생성해야 한다."
> 이 문서는 1.0.0-alpha 코어 골격의 흐름을 정리한다.

## 1. 큰 그림

```
┌───────────────────────────── Tauri 데스크톱 창 (1600x900 / 1920x1080) ─────────────────────────────┐
│  [Sidebar]   [TabBar]                                                                              │
│   메인        탭1  탭2  탭3 …                                                                       │
│   모듈들     ┌──────────────── Workspace ────────────────┐                                          │
│   설정       │ 활성 탭 컴포넌트   │ (분할 시) 우측 탭 컴포넌트 │                                          │
│             └───────────────────────────────────────────┘                                          │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲ 프론트엔드(Svelte)                          ▼ IPC(invoke)
┌────────────────────────────── Rust 백엔드 (src-tauri) ───────────────────────────────┐
│  paths.rs   폴더 구조(app/note/card/memo/calendar/code/graph/sheet/module)            │
│  storage.rs 파일 read/write + 세션 스냅샷(app/session.json) (경로 탈출 차단)            │
│  modules.rs 모듈 설치/제거 + module/<key>.zip 압축 보관/해제                            │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## 2. 부팅 흐름 (`src/main.js`)

1. `ipc.init()` → 백엔드 `init_storage`가 데이터 루트와 9개 하위 폴더를 보장.
2. `loadSettings()` → `app/settings.json`을 읽어 테마/모션을 `:root` CSS 변수에 반영.
3. `refreshInstalled()` → `app/installed.json`을 읽어 설치된 모듈만 사이드바에 노출.
4. `restoreSession()` → `app/session.json`의 탭 목록을 복원. 없으면 메인 탭을 연다.
5. `App` 컴포넌트 마운트.

## 3. 모듈 프레임워크 (`src/lib/core/modules.js`)

- 모든 모듈은 **매니페스트 규격**을 따른다: `{ key, label, icon, singleton, exclusiveFile, apiVersion, load() }`.
- `LOADERS`에 등록된 키만 동적 `import()` 대상. Vite가 모듈별로 코드를 분리하므로
  **설치되지 않은 모듈의 코드는 번들에서 분리되어 메모리에 올라오지 않는다** (초저사양 요구 충족).
- 설치(`install`)/제거(`uninstall`)는 백엔드 명령을 호출하고 `installed` store를 갱신.
- 새 모듈 추가 절차: `src/lib/modules/<key>/` 폴더 생성 → 매니페스트(`module.js`) 작성 →
  `modules.js`의 `LOADERS`와 `META`에 한 줄 추가. (그 외 코어 수정 불필요)

### 3-1. 모듈용 안정 API (`src/lib/core/api.js`) — "C 방향"

- 모듈은 코어 내부(`ipc.js`, `tabs.js`)를 **직접 import 하지 않는다.** 대신 Workspace가
  마운트 시 주입하는 버전 고정 객체 `cn`만 사용한다.
- `cn` 구성:
  - `cn.storage` : 모듈 폴더(`graph/` 등)로 **범위가 한정된** 파일 입출력
    (`readJson/writeJson/readText/writeText`). 모듈은 자기 폴더 밖을 신경 쓸 필요가 없다.
  - `cn.text`    : 텍스트 범용 확장 호출. 확장이 설치돼 있으면 변환, 없으면 평문 통과
    (`textext.js` 레지스트리 경유 — 모듈끼리 직접 의존하지 않음).
  - `cn.exporter`: SVG→PNG 내보내기(`svgToPngDataUrl`, `savePng`).
- `API_VERSION`으로 호환성 계약을 관리. 매니페스트의 `apiVersion` 메이저가 다르면 경고.
- 이 분리 덕분에 코어 내부가 바뀌어도 모듈은 영향받지 않고, 추후 외부 플러그인(B 방향)
  전환 시 모듈에 `cn`만 주입하면 되어 코드 변경이 최소화된다.

## 3-2. 그래프 다이어그램 모듈 (`src/lib/modules/graph/`)

- `simulation.js` — 힘 기반 레이아웃의 **순수 로직**(척력 + 중심력 + 간선 인력).
  UI와 분리되어 단독 테스트 가능. 격자 고정(`snapToGrid`) 포함.
- `GraphView.svelte` — 보드 UI. 노드(도형·색·텍스트), 간선(유향/무향·굵기),
  드래그, 격자 고정, PNG 내보내기. 코어 접점은 주입된 `cn`뿐.
- 보드는 `graph/<파일>.json`에 저장된다.

## 4. 탭 매니저 (`src/lib/core/tabs.js`)

- `openTab()`은 두 규칙을 강제한다.
  - `singleton`(암기·달력): 이미 열려 있으면 새로 열지 않고 포커스 이동.
  - `exclusiveFile`(노트·메모·에디터·그래프·시트): 같은 파일을 연 탭이 있으면 포커스 이동.
- **활성/비활성(메모리↔디스크)**:
  - 활성 탭 = `active:true` → Workspace가 컴포넌트를 마운트(메모리 점유).
  - `sweepIdle()`(App에서 1분 주기)이 유휴 탭(`IDLE_MS` 초과)을 `active:false`로 내려
    Workspace에서 언마운트 → 메모리 회수. 가벼운 `state`(스크롤 위치 등)만 유지.
- **영속화**: 탭 변경 시 `persist()`가 300ms 디바운스로 `save_session` 호출.
  재실행 시 `restoreSession()`이 복원하되 활성 탭만 다시 마운트.

## 5. Workspace 렌더 (`src/lib/shell/Workspace.svelte`)

- `main`/`settings`는 코어 컴포넌트를 직접 렌더.
- 모듈 탭은 `getManifest(key)` → `manifest.load()`로 컴포넌트를 동적 로드.
- 분할(`splitTabId`)이 있으면 좌/우 두 패널을 렌더.

## 6. 테마 / 모션 (`src/lib/core/settings.js`, `src/app.css`)

- 모든 색/폰트는 CSS 변수. 설정 변경 시 `:root`에 즉시 반영 후 `app/settings.json` 저장.
- 모션은 `:root[data-motion="off"]`가 모든 transition/animation을 0s로 만들어
  **"처음부터 없었던 것처럼"** 동작 (기획서의 완전 최적화 요구).

## 7. 백엔드 안전장치

- `storage.rs`의 `resolve_within`이 `..` 경로 탈출을 차단하여
  데이터 루트(특히 `note/` 하위) 밖 파일 접근을 막는다 — 노트 모듈의
  "note 폴더 밖 파일 접근 금지" 요구의 기반.

## 8. 현재 구현 범위 (1.0.0-alpha 코어)

| 영역 | 상태 |
|---|---|
| 셸(탭/분할/사이드바) | 구현 |
| 테마 엔진 / 모션 토글 / 해상도 | 구현 |
| 모듈 프레임워크 / 설치·제거 | 구현 |
| 탭 활성·비활성 / 세션 영속화 | 구현 |
| 메인화면 + 위젯 4종(시계 완전, 디데이/달력/인용구) | 구현 |
| 모듈용 안정 API(`api.js`) + 텍스트 확장 레지스트리(`textext.js`) | 구현 |
| 메모 모듈 | 구현 (안정 API 사용) |
| 그래프 다이어그램 모듈(물리 시뮬레이션 + PNG 내보내기) | 구현 |
| 노트 · 암기(FSRS) · 달력 · 에디터(vi) · 시트 | **미구현 — 다음 단계** |
| 텍스트 범용 확장(TeX/SMILES) 모듈 본체 | **미구현 — 레지스트리만 준비됨** |

## 9. 빌드 / 배포

- 프론트엔드는 `withGlobalTauri`로 노출되는 `window.__TAURI__`만 사용한다
  (`@tauri-apps/api` npm 의존성 없음 — 의존 최소화).
- `npm run tauri build` → Windows는 NSIS 설치 프로그램(.exe) 생성.
- 비전문가용 원클릭: `BUILD-INSTALLER.bat` → `build-installer.ps1`이
  필요한 도구를 winget으로 자동 설치 후 빌드.
- CI: `.github/workflows/build-installer.yml`이 windows 러너에서 설치 파일을
  자동 빌드해 Artifact로 업로드.

자세한 빌드/보안 보완 내용은 `README.md` 참고.
