import "server-only";

import { Booking } from "@/models/Booking";
import { User } from "@/models/User";

export type DemoConversionSummary = {
  scheduled: number;
  done: number;
  converted: number;
  noShow: number;
  rate: number;
};

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/**
 * Demo pipeline for a single coach inside a date range. Conversion rate is
 * measured against demos actually delivered, matching the academy-wide figure
 * on the finance dashboard.
 */
export async function getCoachDemoConversion(coachId: string, range: { from: Date; to: Date }): Promise<DemoConversionSummary> {
  const bookings: any[] = await Booking.find({
    bookingType: "demo",
    $or: [{ assignedCoach: coachId }, { instructor: coachId }],
    startAt: { $gte: range.from, $lte: range.to },
  })
    .select("student demoStatus feedbackStatus status startAt")
    .lean();

  if (!bookings.length) return { scheduled: 0, done: 0, converted: 0, noShow: 0, rate: 0 };

  const studentIds = [...new Set(bookings.map((booking) => idOf(booking.student)).filter(Boolean))];
  const students: any[] = await User.find({ _id: { $in: studentIds } }).select("conversionSetup.convertedFromBooking").lean();
  const convertedFrom = new Set(students.map((student) => idOf(student.conversionSetup?.convertedFromBooking)).filter(Boolean));

  const done = bookings.filter(
    (booking) => booking.demoStatus === "COMPLETED" || booking.demoStatus === "CONVERTED" || booking.feedbackStatus === "submitted"
  );
  const converted = bookings.filter((booking) => booking.demoStatus === "CONVERTED" || convertedFrom.has(idOf(booking)));
  const noShow = bookings.filter((booking) => booking.demoStatus === "STUDENT_NO_SHOW" || booking.demoStatus === "ABSENT");

  return {
    scheduled: bookings.length,
    done: done.length,
    converted: converted.length,
    noShow: noShow.length,
    rate: done.length ? Math.round((converted.length / done.length) * 1000) / 10 : 0,
  };
}
