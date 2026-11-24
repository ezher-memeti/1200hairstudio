"use client";
import { useLocale as useInterfaceLocale } from "next-intl";
import { textFor as interfaceText } from "@/i18n/text";

import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useMemo, useState, useTransition } from "react";
import { Bell, Building2, CalendarClock, Check, CircleDollarSign, LockKeyhole } from "lucide-react";
import AdminSelect from "@/components/admin/AdminSelect";
import LogoutButton from "@/components/admin/LogoutButton";
import {
  changeAdminPassword,
  saveBookingSettings,
  saveBusinessSettings,
  saveFinanceSettings,
  saveAppointmentReminderSettings,
  saveNotificationSettings,
} from "@/app/admin/(dashboard)/settings/actions";
import {
  type AdminSettings,
  type BookingSettings,
  type BusinessSettings,
  type FinanceSettings,
  type NotificationSettings,
  type PaymentMethodSetting,
} from "@/lib/admin/settings";
import type { AppointmentReminderSettings } from "@/lib/reminders/settings";

type Section = "business" | "booking" | "notifications" | "finance" | "security";
type Notice = { kind: "success" | "error"; text: string } | null;

const sections = [
  { id: "business", label: "Business", icon: Building2 },
  { id: "booking", label: "Booking", icon: CalendarClock },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "finance", label: "Finance", icon: CircleDollarSign },
  { id: "security", label: "Security", icon: LockKeyhole },
] as const;

const inputClass = "mt-2 min-h-11 w-full rounded-[3px] border border-border bg-[#11110f] px-4 font-admin-primary text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-accent";
const labelClass = "font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted";

function Field({ label, value, onChange, type = "text", required = false, placeholder, min, max }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string; min?: number; max?: number }) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  return <label className="block"><span className={labelClass}>{displayText(label)}</span><input type={type} required={required} min={min} max={max} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>;
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-16 w-full items-center justify-between gap-4 border-b border-border/70 py-4 text-left last:border-b-0"><span><span className="block text-sm font-medium text-foreground">{displayText(label)}</span><span className="mt-1 block text-xs leading-5 text-foreground-muted">{displayText(description)}</span></span><span className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? "border-accent bg-accent" : "border-border bg-background"}`}><span className={`absolute top-1/2 size-4 -translate-y-1/2 rounded-full transition-all ${checked ? "left-6 bg-background" : "left-1 bg-foreground-muted"}`} /></span></button>;
}

function SectionHeader({ title, description, dirty }: { title: string; description: string; dirty?: boolean }) {
  const uiText = useUiText();

  const ui = useTranslations("ui");

  return <div className="border-b border-border pb-5"><div className="flex flex-wrap items-center gap-3"><h2 className="font-admin-display text-2xl font-semibold text-foreground sm:text-3xl">{uiText(title)}</h2>{dirty ? <span className="border border-accent/30 bg-accent/10 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-accent">{ui("m29267269c048")}</span> : null}</div><p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-secondary">{uiText(description)}</p></div>;
}

function SaveBar({ pending, dirty, notice, onSave }: { pending: boolean; dirty: boolean; notice: Notice; onSave: () => void }) {
  const uiText = useUiText();

  const ui = useTranslations("ui");

  return <div className="mt-7 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between"><div aria-live="polite">{notice ? <p className={`text-sm ${notice.kind === "success" ? "text-emerald-300" : "text-red-300"}`}>{uiText(notice.text)}</p> : dirty ? <p className="text-xs text-foreground-muted">{ui("m4e7362be3ed7")}</p> : <p className="flex items-center gap-2 text-xs text-foreground-muted"><Check size={13} /> {" "}{ui("m9595b7da9f61")}</p>}</div><button type="button" disabled={pending || !dirty} onClick={onSave} className="min-h-11 bg-accent px-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted">{uiText(pending ? "Saving…" : "Save Changes")}</button></div>;
}

export default function AdminSettingsView({ initialSettings, initialReminderSettings, adminEmail, gmailConnected }: { initialSettings: AdminSettings; initialReminderSettings: AppointmentReminderSettings; adminEmail: string; gmailConnected: boolean }) {
  const uiText = useUiText();

  const ui = useTranslations("ui");

  const [active, setActive] = useState<Section>("business");
  const [settings, setSettings] = useState(initialSettings);
  const [saved, setSaved] = useState(initialSettings);
  const [reminderSettings, setReminderSettings] = useState(initialReminderSettings);
  const [savedReminderSettings, setSavedReminderSettings] = useState(initialReminderSettings);
  const [notice, setNotice] = useState<Record<Section, Notice>>({ business: null, booking: null, notifications: null, finance: null, security: null });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isPending, startTransition] = useTransition();
  const dirty = useMemo(() => ({ business: JSON.stringify(settings.business) !== JSON.stringify(saved.business), booking: JSON.stringify(settings.booking) !== JSON.stringify(saved.booking), notifications: JSON.stringify(settings.notifications) !== JSON.stringify(saved.notifications) || JSON.stringify(reminderSettings) !== JSON.stringify(savedReminderSettings), finance: JSON.stringify(settings.finance) !== JSON.stringify(saved.finance), security: Boolean(password || confirmation) }), [settings, saved, reminderSettings, savedReminderSettings, password, confirmation]);

  function update<K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setNotice((current) => ({ ...current, [key]: null }));
  }

  function saveSection(section: Exclude<Section, "security">) {
    if (section === "notifications" && (!Number.isInteger(reminderSettings.hoursBefore) || reminderSettings.hoursBefore < 1 || reminderSettings.hoursBefore > 720)) {
      setNotice((current) => ({ ...current, notifications: { kind: "error", text: "Reminder timing must be between 1 and 720 whole hours." } }));
      return;
    }
    startTransition(async () => {
      const result = section === "notifications"
        ? await (async () => { const notificationResult = await saveNotificationSettings(settings.notifications); if (!notificationResult.success) return notificationResult; return saveAppointmentReminderSettings(reminderSettings); })()
        : await (section === "business" ? saveBusinessSettings(settings.business) : section === "booking" ? saveBookingSettings(settings.booking) : saveFinanceSettings(settings.finance));
      setNotice((current) => ({ ...current, [section]: { kind: result.success ? "success" : "error", text: result.message } }));
      if (result.success) { setSaved((current) => ({ ...current, [section]: settings[section] })); if (section === "notifications") setSavedReminderSettings(reminderSettings); }
    });
  }

  function changePassword() {
    startTransition(async () => {
      const result = await changeAdminPassword(password, confirmation);
      setNotice((current) => ({ ...current, security: { kind: result.success ? "success" : "error", text: result.message } }));
      if (result.success) { setPassword(""); setConfirmation(""); }
    });
  }

  const paymentLabels: Record<PaymentMethodSetting, string> = { cash: "Cash", twint: "TWINT", card: "Card", bank_transfer: "Bank transfer", other: "Other" };

  return <section className="min-w-0">
    <header className="border-b border-border pb-7"><p className="text-[10px] uppercase tracking-[0.24em] text-accent">{ui("md01267ded931")}</p><h1 className="mt-3 font-admin-display text-4xl font-semibold tracking-[-0.03em] text-foreground sm:text-5xl">{ui("mc7f73bb54d92")}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-foreground-secondary">{ui("mcfec52f6fe7f")}</p></header>
    <div className="mt-7 grid min-w-0 gap-7 lg:grid-cols-[220px_minmax(0,1fr)] xl:gap-10">
      <nav aria-label={ui("m2e7109bda2f0")} className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain scroll-smooth border-b border-border pb-3 [scrollbar-width:none] lg:block lg:space-y-1 lg:overflow-visible lg:border-b-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">{sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setActive(id)} className={`flex min-h-11 shrink-0 items-center gap-3 border-l px-4 py-3 text-[10px] uppercase tracking-[0.16em] transition-colors lg:w-full ${active === id ? "border-accent bg-accent/[0.07] text-accent" : "border-transparent text-foreground-muted hover:border-border hover:bg-surface hover:text-foreground"}`}><Icon size={15} />{uiText(label)}{dirty[id] ? <span className="ml-auto size-1.5 rounded-full bg-accent" aria-label={ui("m29267269c048")} /> : null}</button>)}</nav>
      <div className="min-w-0 border border-border bg-surface p-5 sm:p-7 lg:p-8">
        {active === "business" ? <div><SectionHeader title={ui("md6663dda5fe9")} description={ui("m523ec5b368a8")} dirty={dirty.business} /><div className="mt-6 grid gap-5 sm:grid-cols-2"><Field label={ui("m4fee51fde270")} required value={settings.business.businessName} onChange={(value) => update("business", { ...settings.business, businessName: value })} /><Field label={ui("md5e920a5cb6c")} required value={settings.business.addressLine} onChange={(value) => update("business", { ...settings.business, addressLine: value })} /><Field label={ui("mc7ac934cfaa9")} required value={settings.business.postalCode} onChange={(value) => update("business", { ...settings.business, postalCode: value })} /><Field label={ui("m4271627f4f0b")} required value={settings.business.city} onChange={(value) => update("business", { ...settings.business, city: value })} /><Field label={ui("m0f217179940c")} value={settings.business.region} placeholder={ui("m103ac632ad77")} onChange={(value) => update("business", { ...settings.business, region: value })} /><Field label={ui("md523ebbd1014")} required value={settings.business.country} onChange={(value) => update("business", { ...settings.business, country: value })} /><Field label={ui("m77064d526523")} value={settings.business.phone} placeholder={ui("m7c8671e54eec")} onChange={(value) => update("business", { ...settings.business, phone: value })} /><Field label={ui("m84add5b29527")} type="email" value={settings.business.email} placeholder={ui("mce6adcae5d00")} onChange={(value) => update("business", { ...settings.business, email: value })} /><Field label={ui("m2e8a57cc5c47")} value={settings.business.website} placeholder={ui("mf80014f90e7c")} onChange={(value) => update("business", { ...settings.business, website: value })} /><AdminSelect label={ui("md1f7dc891b5e")} value={settings.business.timezone} onChange={(value) => update("business", { ...settings.business, timezone: value })} options={[{ value: "Europe/Zurich", label: "Europe/Zurich" }]} /><AdminSelect label={ui("me070de224434")} value={settings.business.currency} onChange={() => undefined} disabled options={[{ value: "CHF", label: "CHF — Swiss Franc" }]} /></div><SaveBar pending={isPending} dirty={dirty.business} notice={notice.business} onSave={() => saveSection("business")} /></div> : null}
        {active === "booking" ? <div><SectionHeader title={ui("me38ea8eebe78")} description={ui("md902a52c5d73")} dirty={dirty.booking} /><div className="mt-6 grid gap-5 sm:grid-cols-2"><Field label={ui("mfbdb515f2726")} type="number" value={settings.booking.slotIntervalMinutes} onChange={(value) => update("booking", { ...settings.booking, slotIntervalMinutes: Number(value) })} /><Field label={ui("mf4b412413e9e")} type="number" value={settings.booking.minimumNoticeHours} onChange={(value) => update("booking", { ...settings.booking, minimumNoticeHours: Number(value) })} /><Field label={ui("md410763cdf75")} type="number" value={settings.booking.maximumHorizonDays} onChange={(value) => update("booking", { ...settings.booking, maximumHorizonDays: Number(value) })} /><Field label={ui("mad586e94ce42")} type="number" value={settings.booking.cancellationCutoffHours} onChange={(value) => update("booking", { ...settings.booking, cancellationCutoffHours: Number(value) })} /></div><div className="mt-6 border-y border-border px-1"><Toggle label={ui("m4a030d0c6377")} description={ui("mb48b8931b1d0")} checked={settings.booking.allowGuestBookings} onChange={(value) => update("booking", { ...settings.booking, allowGuestBookings: value })} /><Toggle label={ui("mbf504aa6b532")} description={ui("md05590aada4d")} checked={settings.booking.allowCustomerReschedule} onChange={(value) => update("booking", { ...settings.booking, allowCustomerReschedule: value })} /><Toggle label={ui("m24c353b42464")} description={ui("m8f141b066615")} checked={settings.booking.allowCustomerCancel} onChange={(value) => update("booking", { ...settings.booking, allowCustomerCancel: value })} /></div><SaveBar pending={isPending} dirty={dirty.booking} notice={notice.booking} onSave={() => saveSection("booking")} /></div> : null}
        {active === "notifications" ? <div><SectionHeader title={ui("m753a22b2eb61")} description={ui("m0c027905ab13")} dirty={dirty.notifications} /><div className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><Field label={ui("m679e8f61b9fb")} value={settings.notifications.senderName} onChange={(value) => update("notifications", { ...settings.notifications, senderName: value })} /><div className="border border-border bg-background px-4 py-3"><p className={labelClass}>{ui("mebb1440d4fa2")}</p><p className={`mt-1 text-sm ${gmailConnected ? "text-emerald-300" : "text-amber-300"}`}>{uiText(gmailConnected ? "Connected" : "Needs reconnect")}</p></div></div><div className="mt-6 border-y border-border px-1"><Toggle label={ui("m81b11291f73d")} description={ui("m484c72adcc02")} checked={settings.notifications.bookingConfirmationEmail} onChange={(value) => update("notifications", { ...settings.notifications, bookingConfirmationEmail: value })} /><Toggle label={ui("m7655514dba1a")} description={ui("m91bf32503895")} checked={settings.notifications.rescheduleEmail} onChange={(value) => update("notifications", { ...settings.notifications, rescheduleEmail: value })} /><Toggle label={ui("me7e8e64eb4a5")} description={ui("m34174e4a5e5a")} checked={settings.notifications.cancellationEmail} onChange={(value) => update("notifications", { ...settings.notifications, cancellationEmail: value })} /><Toggle label={ui("mc9ced67d2d73")} description={ui("m0ded7c784e78")} checked={settings.notifications.receiptEmailEnabled} onChange={(value) => update("notifications", { ...settings.notifications, receiptEmailEnabled: value })} /><Toggle label={ui("m7b19d730bf64")} description={ui("mae9ea0dc77b5")} checked={settings.notifications.adminBookingNotification} onChange={(value) => update("notifications", { ...settings.notifications, adminBookingNotification: value })} /></div><section className="mt-8 border border-border bg-background/40 p-4 sm:p-5"><div className="flex items-center justify-between gap-4"><div><p className={labelClass}>{ui("m0654081091c2")}</p><p className="mt-2 text-xs leading-5 text-foreground-muted">{ui("me145386cbe73")}</p></div><Toggle label={ui("mdf174a3f2faa")} description="" checked={reminderSettings.enabled} onChange={(enabled) => { setReminderSettings((current) => ({...current,enabled})); setNotice((current) => ({...current,notifications:null})); }}/></div><div className="mt-5 max-w-xs"><Field label={ui("m074f27aa8ade")} type="number" value={reminderSettings.hoursBefore} onChange={(value) => { setReminderSettings((current) => ({...current,hoursBefore:Number(value)})); setNotice((current) => ({...current,notifications:null})); }}/></div><div className="mt-6 border-t border-border"><Toggle label={ui("m84add5b29527")} description={ui("md8926b8c574d")} checked={reminderSettings.emailEnabled} onChange={(emailEnabled) => setReminderSettings((current) => ({...current,emailEnabled}))}/><Toggle label="WhatsApp" description={ui("m7fa7e473c0bf")} checked={reminderSettings.whatsappEnabled} onChange={(whatsappEnabled) => setReminderSettings((current) => ({...current,whatsappEnabled}))}/></div></section><SaveBar pending={isPending} dirty={dirty.notifications} notice={notice.notifications} onSave={() => saveSection("notifications")} /></div> : null}
        {active === "finance" ? <div><SectionHeader title={ui("m1b48d3f01424")} description={ui("m01120df79ddc")} dirty={dirty.finance} /><div className="mt-6 grid gap-5 sm:grid-cols-2"><AdminSelect label={ui("me070de224434")} value={settings.finance.currency} onChange={() => undefined} disabled options={[{ value: "CHF", label: "CHF — Swiss Franc" }]} /><AdminSelect label={ui("mad96077c097a")} value={settings.finance.defaultReportGrouping} onChange={(value) => update("finance", { ...settings.finance, defaultReportGrouping: value as FinanceSettings["defaultReportGrouping"] })} options={[{ value: "day", label: "By Day" }, { value: "week", label: "By Week" }, { value: "month", label: "By Month" }]} /></div><div className="mt-6 border-y border-border px-1"><Toggle label={ui("m9f42fea19026")} description={ui("mc553aa056af9")} checked={settings.finance.autoGenerateReceipt} onChange={(value) => update("finance", { ...settings.finance, autoGenerateReceipt: value })} /></div><div className="mt-6"><p className={labelClass}>{ui("md4c065e76c78")}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{(Object.keys(paymentLabels) as PaymentMethodSetting[]).map((method) => { const checked = settings.finance.enabledPaymentMethods.includes(method); return <button key={method} type="button" onClick={() => update("finance", { ...settings.finance, enabledPaymentMethods: checked ? settings.finance.enabledPaymentMethods.filter((item) => item !== method) : [...settings.finance.enabledPaymentMethods, method] })} className={`flex min-h-12 items-center justify-between border px-4 text-sm transition-colors ${checked ? "border-accent/50 bg-accent/[0.08] text-foreground" : "border-border bg-background text-foreground-secondary hover:border-foreground-muted"}`}><span>{uiText(paymentLabels[method])}</span><span className={`flex size-5 items-center justify-center border ${checked ? "border-accent bg-accent text-background" : "border-border"}`}>{checked ? <Check size={13} /> : null}</span></button>; })}</div></div><SaveBar pending={isPending} dirty={dirty.finance} notice={notice.finance} onSave={() => saveSection("finance")} /></div> : null}
        {active === "security" ? <div><SectionHeader title={ui("mf25ce1b8a399")} description={ui("m72d118d5137b")} dirty={dirty.security} /><div className="mt-6 border-b border-border pb-6"><p className={labelClass}>{ui("m9439d9bab66c")}</p><p className="mt-2 break-all text-sm text-foreground">{adminEmail || uiText("Email unavailable")}</p></div><div className="mt-6"><h3 className="text-sm font-semibold text-foreground">{ui("m8c684290ce0b")}</h3><p className="mt-1 text-xs leading-5 text-foreground-muted">{ui("md76968a1ecc0")}</p><div className="mt-4 grid gap-5 sm:grid-cols-2"><Field label={ui("m4894cb39ee41")} type="password" value={password} onChange={(value) => { setPassword(value); setNotice((current) => ({ ...current, security: null })); }} /><Field label={ui("mc2d404cb7bad")} type="password" value={confirmation} onChange={(value) => { setConfirmation(value); setNotice((current) => ({ ...current, security: null })); }} /></div><div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div aria-live="polite">{notice.security ? <p className={`text-sm ${notice.security.kind === "success" ? "text-emerald-300" : "text-red-300"}`}>{uiText(notice.security.text)}</p> : null}</div><button type="button" disabled={isPending || !dirty.security} onClick={changePassword} className="min-h-11 border border-accent px-6 text-[10px] uppercase tracking-[0.16em] text-accent hover:bg-accent hover:text-background disabled:cursor-not-allowed disabled:border-border disabled:text-foreground-muted">{uiText(isPending ? "Updating…" : "Update Password")}</button></div></div><div className="mt-8 border-t border-border pt-6"><h3 className="text-sm font-semibold text-foreground">{ui("mf7f1997c6cd1")}</h3><p className="mt-1 text-xs leading-5 text-foreground-muted">{ui("m6676989bf533")}</p><div className="mt-4 max-w-xs"><LogoutButton fullWidth /></div></div></div> : null}
      </div>
    </div>
  </section>;
}
