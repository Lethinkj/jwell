export const PLACEHOLDER_LABELS: Record<string, string> = {
  customer_name: 'Customer name',
  date: "Today's date",
  occasion_date: 'Occasion date',
  years: 'Years (age / anniversary)',
  festival_name: 'Festival name',
  festival_date: 'Festival date',
  shop_name: 'Shop name',
  shop_phone: 'Shop phone',
  shop_address: 'Shop address',
  invoice_no: 'Invoice number',
  total: 'Amount',
  offer_details: 'Offer details',
};

export function toPlaceholders(keys: string[]) {
  return keys.map((k) => ({ key: k, label: PLACEHOLDER_LABELS[k] || k }));
}

export const FESTIVAL_PLACEHOLDER_KEYS = ['customer_name', 'festival_name', 'festival_date', 'date', 'shop_name', 'shop_phone', 'shop_address'];
