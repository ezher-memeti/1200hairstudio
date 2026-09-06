import { getUtcIsoForZurichDateTime } from "@/lib/appointments/availability";
import { getAdminAppointmentsInRange } from "@/lib/appointments/queries";
import { calculateFinanceComparison } from "@/lib/finance/comparison";
import { getAdminFinanceData } from "@/lib/finance/queries";
import { getAvailableSlotTimes } from "@/lib/public/available-slots";
import { getActiveServices } from "@/lib/public/services";

const dateKey = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
function addDays(key: string, days: number) { const [year,month,day]=key.split("-").map(Number); const value=new Date(Date.UTC(year,month-1,day+days,12)); return `${value.getUTCFullYear()}-${String(value.getUTCMonth()+1).padStart(2,"0")}-${String(value.getUTCDate()).padStart(2,"0")}`; }

export async function getAdminDashboardData() {
  const now = new Date();
  const today = dateKey(now);
  const tomorrow = addDays(today, 1);
  const afterTomorrow = addDays(today, 2);
  const [todayAppointments, tomorrowAppointments, finance, services] = await Promise.all([
    getAdminAppointmentsInRange(getUtcIsoForZurichDateTime(today,"00:00"),getUtcIsoForZurichDateTime(tomorrow,"00:00")),
    getAdminAppointmentsInRange(getUtcIsoForZurichDateTime(tomorrow,"00:00"),getUtcIsoForZurichDateTime(afterTomorrow,"00:00")),
    getAdminFinanceData(),
    getActiveServices(),
  ]);
  const availabilityService=[...services].sort((a,b)=>(a.duration_max??a.duration_min)-(b.duration_max??b.duration_min))[0];
  const availableSlots=availabilityService?await getAvailableSlotTimes(availabilityService.id,today):[];
  const monthComparison=calculateFinanceComparison({range:"month",now,transactions:finance.transactions,appointments:finance.appointments});
  const todayComparison=calculateFinanceComparison({range:"today",now,transactions:finance.transactions,appointments:finance.appointments});
  const sevenDayComparison=calculateFinanceComparison({range:"custom",customStart:addDays(today,-6),customEnd:today,now,transactions:finance.transactions,appointments:finance.appointments});
  const thirtyDayComparison=calculateFinanceComparison({range:"custom",customStart:addDays(today,-29),customEnd:today,now,transactions:finance.transactions,appointments:finance.appointments});
  return {today,tomorrow,now:now.toISOString(),todayAppointments,tomorrowAppointments,availableSlots,availabilityService:availabilityService??null,finance,todayComparison,monthComparison,sevenDayComparison,thirtyDayComparison};
}
