import { SmsInbox } from "@/components/telephone/SmsInbox";

export default function MessageriePage() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Messagerie</h1>
        <p className="text-sm text-muted-foreground">Vos conversations SMS.</p>
      </header>
      <SmsInbox />
    </div>
  );
}
