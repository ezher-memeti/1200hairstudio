export type ServiceRecord = {
  name_de?: string | null;

  id: string;
  name: string;
  source_name?: string;
  price: number;
  duration_min: number;
  duration_max: number | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
