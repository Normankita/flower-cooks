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
  customers: { id: string; name: string; phone: string } | null;
  offices: { id: string; name: string } | null;
  order_lines: OrderLine[];
};
