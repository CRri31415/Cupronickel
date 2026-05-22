// modules/calendar/module.js
// 달력 모듈 매니페스트. singleton=true (동시에 한 탭만).
import CalendarView from "./CalendarView.svelte";

export default {
  label: "달력",
  icon: "L",
  singleton: true,
  exclusiveFile: false,
  apiVersion: "1.0",
  load: async () => ({ default: CalendarView }),
};
