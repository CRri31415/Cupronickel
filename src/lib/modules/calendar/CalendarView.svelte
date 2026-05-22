<script>
  // ───────────────────────────────────────────────────────────────────────
  // 달력 모듈 — 일정 관리 + 히트맵.
  //
  // 일정 속성(기획서):
  //  - 중요도 4단계, 태그(분류), 여러 날에 걸친 기간(start~end), 후속 일정(followsId),
  //    설명(텍스트 — 텍스트 범용 확장 적용 대상이나 제목엔 미적용).
  // 검색: 태그 필터 + 날짜순 정렬.
  // 히트맵: 날짜별 일정 수를 색 농도로 월 그리드에 표시.
  //
  // 데이터는 calendar/events.json. 코어 접점은 cn(안정 API)뿐.
  // ───────────────────────────────────────────────────────────────────────
  import { onMount } from "svelte";

  export let tab;
  export let cn;

  const FILE = "events.json";
  let events = [];   // {id, title, start, end, importance(1-4), tags[], desc, followsId}
  let loaded = false;

  // 보는 달
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth(); // 0-base

  let selected = null;     // 편집 중 일정
  let filterTag = "";      // 태그 필터

  let _id = 0;
  const eid = () => `e${Date.now()}_${_id++}`;
  const iso = (d) => d.toISOString().slice(0, 10);

  onMount(load);
  async function load() {
    events = (await cn.storage.readJson(FILE, [])) ?? [];
    loaded = true;
  }
  function save() { cn.storage.writeJson(FILE, events); }

  // --- 달 이동 ---
  function prevMonth() { if (--month < 0) { month = 11; year--; } }
  function nextMonth() { if (++month > 11) { month = 0; year++; } }

  // --- 일정 편집 ---
  function addEvent(dateStr) {
    const e = { id: eid(), title: "새 일정", start: dateStr, end: dateStr, importance: 2, tags: [], desc: "", followsId: null };
    events = [...events, e];
    selected = e;
    save();
  }
  function patch(patchObj) {
    if (!selected) return;
    selected = { ...selected, ...patchObj };
    events = events.map((e) => (e.id === selected.id ? selected : e));
    save();
  }
  function removeEvent(id) {
    events = events.filter((e) => e.id !== id);
    // 이 일정을 후속으로 가리키던 것들 정리
    events = events.map((e) => (e.followsId === id ? { ...e, followsId: null } : e));
    if (selected?.id === id) selected = null;
    save();
  }
  function setTags(str) { patch({ tags: str.split(",").map((t) => t.trim()).filter(Boolean) }); }

  // --- 월 그리드 + 히트맵 ---
  $: firstDay = new Date(year, month, 1).getDay();
  $: daysInMonth = new Date(year, month + 1, 0).getDate();
  $: cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  // 날짜별 일정 수(기간 일정은 걸쳐 있는 모든 날에 카운트) — 히트맵용
  $: countByDate = (() => {
    const m = {};
    for (const e of events) {
      if (filterTag && !e.tags.includes(filterTag)) continue;
      const s = new Date(e.start), en = new Date(e.end || e.start);
      for (let d = new Date(s); d <= en; d.setDate(d.getDate() + 1)) {
        m[iso(d)] = (m[iso(d)] || 0) + 1;
      }
    }
    return m;
  })();
  $: maxCount = Math.max(1, ...Object.values(countByDate));

  function heatStyle(day) {
    if (!day) return "";
    const key = iso(new Date(year, month, day));
    const c = countByDate[key] || 0;
    if (!c) return "";
    const ratio = c / maxCount;
    return `background: color-mix(in srgb, var(--accent-2) ${Math.round(20 + ratio*60)}%, transparent)`;
  }
  function eventsOn(day) {
    const key = iso(new Date(year, month, day));
    return events.filter((e) => {
      if (filterTag && !e.tags.includes(filterTag)) return false;
      return key >= e.start && key <= (e.end || e.start);
    });
  }

  // 모든 태그(필터 드롭다운)
  $: allTags = [...new Set(events.flatMap((e) => e.tags))];
  // 정렬된 일정 목록(날짜순)
  $: sortedEvents = [...events]
    .filter((e) => !filterTag || e.tags.includes(filterTag))
    .sort((a, b) => a.start.localeCompare(b.start));

  const IMP_LABELS = { 1: "낮음", 2: "보통", 3: "높음", 4: "긴급" };
  const IMP_COLORS = { 1: "var(--text-dim)", 2: "var(--accent-2)", 3: "var(--accent)", 4: "var(--danger)" };
</script>

<div class="cal-mod editable">
  <div class="grid-pane">
    <header>
      <button on:click={prevMonth} aria-label="이전 달">‹</button>
      <h2>{year}년 {month + 1}월</h2>
      <button on:click={nextMonth} aria-label="다음 달">›</button>
      <select class="filter" value={filterTag} on:change={(e) => (filterTag = e.target.value)}>
        <option value="">전체 태그</option>
        {#each allTags as t}<option value={t}>{t}</option>{/each}
      </select>
    </header>

    <div class="weekdays">
      {#each ["일","월","화","수","목","금","토"] as w}<span>{w}</span>{/each}
    </div>
    <div class="days">
      {#each cells as day}
        <div class="day" class:empty={!day} style={heatStyle(day)}
             on:dblclick={() => day && addEvent(iso(new Date(year, month, day)))}>
          {#if day}
            <span class="num" class:today={day === today.getDate() && month === today.getMonth() && year === today.getFullYear()}>{day}</span>
            {#each eventsOn(day).slice(0, 3) as e (e.id)}
              <div class="chip" style="border-left:3px solid {IMP_COLORS[e.importance]}"
                   on:click={() => (selected = e)} title={e.title}>{e.title}</div>
            {/each}
          {/if}
        </div>
      {/each}
    </div>
    <p class="tip">날짜를 더블클릭하면 일정이 추가됩니다.</p>
  </div>

  <!-- 일정 목록(날짜순) -->
  <aside class="list-pane">
    <h3>일정 ({sortedEvents.length})</h3>
    <div class="ev-list">
      {#each sortedEvents as e (e.id)}
        <div class="ev" class:sel={selected?.id === e.id} on:click={() => (selected = e)}>
          <span class="dot" style="background:{IMP_COLORS[e.importance]}"></span>
          <div class="ev-main">
            <div class="ev-title">{e.title}</div>
            <div class="ev-date">{e.start}{e.end && e.end !== e.start ? ` ~ ${e.end}` : ""}</div>
          </div>
        </div>
      {/each}
    </div>
  </aside>

  <!-- 일정 편집 패널 -->
  {#if selected}
    <div class="editor">
      <h3>일정 편집</h3>
      <label>제목<input value={selected.title} on:input={(e) => patch({ title: e.target.value })} /></label>
      <div class="dates">
        <label>시작<input type="date" value={selected.start} on:change={(e) => patch({ start: e.target.value })} /></label>
        <label>종료<input type="date" value={selected.end} on:change={(e) => patch({ end: e.target.value })} /></label>
      </div>
      <label>중요도
        <select value={selected.importance} on:change={(e) => patch({ importance: Number(e.target.value) })}>
          {#each [1,2,3,4] as i}<option value={i}>{IMP_LABELS[i]}</option>{/each}
        </select>
      </label>
      <label>태그(쉼표 구분)<input value={selected.tags.join(", ")} on:input={(e) => setTags(e.target.value)} /></label>
      <label>후속 일정
        <select value={selected.followsId ?? ""} on:change={(e) => patch({ followsId: e.target.value || null })}>
          <option value="">없음</option>
          {#each events.filter((x) => x.id !== selected.id) as x}<option value={x.id}>{x.title}</option>{/each}
        </select>
      </label>
      <label>설명<textarea value={selected.desc} on:input={(e) => patch({ desc: e.target.value })}></textarea></label>
      <div class="ed-actions">
        <button class="danger" on:click={() => removeEvent(selected.id)}>삭제</button>
        <button on:click={() => (selected = null)}>닫기</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .cal-mod { height: 100%; display: grid; grid-template-columns: 1fr 240px; gap: 0; box-sizing: border-box; position: relative; }
  .grid-pane { padding: 20px; display: flex; flex-direction: column; min-width: 0; }
  header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  header h2 { margin: 0; font-weight: 500; font-size: 18px; min-width: 130px; }
  header button { border: 1px solid var(--line); border-radius: 6px; width: 30px; height: 30px; }
  .filter { margin-left: auto; background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; }

  .weekdays, .days { display: grid; grid-template-columns: repeat(7, 1fr); }
  .weekdays span { text-align: center; color: var(--text-dim); font-size: 12px; padding: 4px 0; }
  .days { flex: 1; gap: 4px; }
  .day { border: 1px solid var(--line); border-radius: 6px; padding: 4px; min-height: 70px; overflow: hidden; cursor: default; }
  .day.empty { border: none; }
  .num { font-size: 12px; color: var(--text-dim); }
  .num.today { color: var(--bg); background: var(--accent); border-radius: 4px; padding: 0 5px; }
  .chip { font-size: 11px; background: var(--surface-2); border-radius: 3px; padding: 1px 4px; margin-top: 2px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
  .tip { color: var(--text-dim); font-size: 11px; margin: 8px 0 0; }

  .list-pane { border-left: 1px solid var(--line); padding: 20px 14px; overflow: auto; }
  .list-pane h3 { margin: 0 0 10px; font-size: 13px; color: var(--text-dim); }
  .ev-list { display: flex; flex-direction: column; gap: 4px; }
  .ev { display: flex; gap: 8px; align-items: center; padding: 6px; border-radius: 6px; cursor: pointer; }
  .ev:hover, .ev.sel { background: var(--surface-2); }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .ev-title { font-size: 13px; }
  .ev-date { font-size: 11px; color: var(--text-dim); }

  .editor {
    position: absolute; top: 12px; right: 254px; width: 260px;
    background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 14px;
    display: flex; flex-direction: column; gap: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  }
  .editor h3 { margin: 0; font-size: 13px; color: var(--text-dim); }
  .editor label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--text-dim); }
  .editor input, .editor select, .editor textarea {
    background: var(--surface); color: var(--text); border: 1px solid var(--line);
    border-radius: 6px; padding: 5px 7px; font-family: var(--font-ui); font-size: 13px;
  }
  .editor textarea { min-height: 60px; resize: vertical; }
  .dates { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .ed-actions { display: flex; gap: 6px; margin-top: 4px; }
  .ed-actions button { flex: 1; border: 1px solid var(--line); border-radius: 6px; padding: 5px; }
  .danger { color: var(--danger); border-color: var(--danger) !important; }
</style>
