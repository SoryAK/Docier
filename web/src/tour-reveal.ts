/** Asks HomeNav to open (or put back) a closed group for a tour step. */
export const TOUR_REVEAL = "docier:tour-reveal";
export type TourReveal = { target: "resources"; open: boolean };
