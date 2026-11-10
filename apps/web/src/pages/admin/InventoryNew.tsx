import Inventory from './Inventory';

/**
 * `/admin/inventory/new` is kept as a deep link, but the form itself is a
 * popup over the inventory list — same interaction as “+ Add piece”.
 */
export default function InventoryNew() {
  return <Inventory startNew />;
}
