import { BOWBAZAR_REGISTRATION as registration } from "@/lib/branch/registration";

export default function BowbazarRegistration() {
  return (
    <section aria-label="Bowbazar branch registration" className="my-4 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
      <p className="font-semibold">{registration.notice}</p>
      <p>Registered address: {registration.address}</p>
      <p>PAN: {registration.pan}</p>
      <p>Trade licence / Certificate of Enlistment: {registration.tradeLicence}</p>
      <p>Udyam registration: {registration.udyam}</p>
      <p>Branch contact: <a className="underline" href={`mailto:${registration.email}`}>{registration.email}</a></p>
    </section>
  );
}
