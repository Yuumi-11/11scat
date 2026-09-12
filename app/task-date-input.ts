// Task editors display and submit dates in the room's fixed UTC+8 timezone.
export const dateInput = (date: string | null, allDay: boolean) => date ? new Date(Date.parse(date) + 8 * 3600000).toISOString().slice(0, allDay ? 10 : 16) : "";
export const apiDate = (text: string, allDay: boolean, end = false) => text ? `${text}${allDay ? end ? "T23:59:00" : "T00:00:00" : ":00"}+0800` : null;
