"use client";

/**
 * A read-only field that selects its whole value on focus, so a link can be
 * copied in one tap. It lives in its own client file because the tournament
 * page is a server component and cannot pass an onFocus handler itself.
 */
export function SelectOnFocusInput({ value, className }: { value: string; className?: string }) {
  return <input readOnly className={className} value={value} onFocus={(event) => event.currentTarget.select()} />;
}
