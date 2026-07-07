export function isDemoBookingAccount(accountStatus?: string | null) {
  return accountStatus === "demo";
}

export function bookingFeatureNameForAccount(accountStatus?: string | null) {
  return isDemoBookingAccount(accountStatus) ? "Demo Booking" : "Class Booking";
}

export function bookingFeatureNameForType(bookingType?: string | null) {
  return bookingType === "demo" ? "Demo Booking" : "Class Booking";
}

export function bookingFeatureNameLowerForType(bookingType?: string | null) {
  return bookingType === "demo" ? "demo booking" : "class booking";
}
