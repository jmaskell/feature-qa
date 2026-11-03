// Fake lettings data. Every email ends in @example.test. Phones use the 07700 900xxx drama range.
export const LANDLORDS = [
  { id: "l1", name: "Ada Lovelace", email: "ada.lovelace@example.test", phone: "07700 900101" },
  { id: "l2", name: "Siân Llewellyn-Hughes", email: "sian.lh@example.test", phone: "07700 900102" },
];
export const TENANTS = [
  { id: "t1", name: "Grace Hopper", email: "grace.hopper@example.test", phone: "07700 900201", note: "Has a guide dog" },
  { id: "t2", name: "Zoë Brontë-Okafor", email: "zoe.bo@example.test", phone: "07700 900202", note: "Works nights" },
];
export const PROPERTIES = [
  { id: "p1", address: "12 Harbour Row, Penzance", rent: 950, landlordId: "l1", tenantId: "t1", status: "Let" },
  { id: "p2", address: "3 Mill Lane, Hebden Bridge", rent: 720, landlordId: "l2", tenantId: null, status: "Vacant" },
  { id: "p3", address: "Flat 4, 88 Long Street, Bristol", rent: 1100, landlordId: "l1", tenantId: "t2", status: "Let" },
];
export const KNOWN_VALUES = [...LANDLORDS, ...TENANTS].flatMap((p) => [p.name, p.email, p.phone]).concat(TENANTS.map((t) => t.note));
