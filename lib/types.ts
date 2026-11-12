export type Office = { id: string; name: string; active: boolean; sort: number };
export type MenuItem = {
  id: string;
  name: string;
  price: number;
  rice_kg: number;
  protein_kg: number;
  active: boolean;
  sort: number;
};
export type Cycle = {
  id: string;
  title: string;
  opens_at: string;
  closes_at: string;
  delivery_at: string;
  capacity: number;
  lipa_namba: string | null;
  status: "open" | "closed";
  created_at: string;
  /** home delivery controls (migration 0004) */
  home_enabled: boolean;
  home_max_stops: number | null;
  home_max_km: number | null;
  kitchen_lat: number | null;
  kitchen_lng: number | null;
};
export type OrderStatus = "confirmed" | "late_request" | "declined" | "delivered" | "cancelled";
export type PaymentStatus = "unpaid" | "reported" | "paid";
export type OrderLine = {
  id: string;
  qty: number;
  unit_price: number;
  item_id: string;
  menu_items: { name: string; rice_kg: number; protein_kg: number } | null;
};
export type Order = {
  id: string;
  cycle_id: string;
  status: OrderStatus;
  payment_method: "lipa" | "cash";
  payment_status: PaymentStatus;
  payment_ref: string | null;
  total: number;
  notes: string | null;
  delivery_note: string | null;
  review_token: string;
  delivered_at: string | null;
  created_at: string;
  delivery_type: "office" | "home";
  delivery_lat: number | null;
  delivery_lng: number | null;
  location_url: string | null;
  customers: { id: string; name: string; phone: string } | null;
  offices: { id: string; name: string } | null;
  order_lines: OrderLine[];
};
