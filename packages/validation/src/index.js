import { z } from 'zod';

export const purity = z.enum(['24K', '22K', '18K', '14K']);
export const makingType = z.enum(['percentage', 'per_gram', 'fixed']);

export const productSchema = z.object({
  category_id: z.string().min(1),
  sku: z.string().min(2).max(40),
  design_code: z.string().max(40).optional().nullable(),
  name: z.string().min(2).max(160),
  purity: purity.default('22K'),
  gross_weight_g: z.number().positive(),
  stone_weight_g: z.number().min(0).default(0),
  net_gold_weight_g: z.number().positive(),
  making_charge_type: makingType.default('percentage'),
  making_charge_value: z.number().min(0).default(10),
  stone_value_inr: z.number().min(0).default(0),
  wastage_charge_inr: z.number().min(0).default(0),
  other_charges_inr: z.number().min(0).default(0),
  acquisition_cost_inr: z.number().min(0),
  image_url: z.string().max(500).optional().nullable(),
  status: z.enum(['available', 'reserved', 'sold', 'returned', 'under_repair', 'archived']).default('available'),
}).refine(v => v.net_gold_weight_g <= v.gross_weight_g, { message: 'net_gold_weight_g cannot exceed gross_weight_g', path: ['net_gold_weight_g'] });

export const customerSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(7).max(20),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address_line1: z.string().max(200).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  state: z.string().max(80).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable(),
  birthday: z.string().max(10).optional().nullable(),
  anniversary: z.string().max(10).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  preferred_channel: z.enum(['whatsapp', 'email', 'both', 'none']).default('both'),
  marketing_consent: z.coerce.boolean().default(false),
});

export const saleLineSchema = z.object({
  product_id: z.string().min(1),
  discount_inr: z.number().min(0).default(0),
  offer_code: z.string().max(40).optional().nullable(),
});

export const finalizeSchema = z.object({
  customer_id: z.string().optional().nullable(),
  customer_inline: customerSchema.optional(),
  payments: z.array(z.object({
    method: z.enum(['cash', 'upi', 'card', 'bank_transfer']),
    amount_inr: z.number().positive(),
    reference: z.string().max(120).optional().nullable(),
  })).min(1),
  tax_rate_pct: z.number().min(0).max(28).default(3),
  lines: z.array(saleLineSchema).min(1),
});
