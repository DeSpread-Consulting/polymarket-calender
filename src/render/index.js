import { renderWeekView } from './weekView.js';
import { renderCalendarOverview } from './calendarView.js';

export function renderCalendar(searchQuery = '') {
    if (document.startViewTransition) {
        document.startViewTransition(() => {
            renderWeekView(searchQuery);
            renderCalendarOverview(searchQuery);
        });
    } else {
        renderWeekView(searchQuery);
        renderCalendarOverview(searchQuery);
    }
}

export { renderWeekView, renderCalendarOverview };
