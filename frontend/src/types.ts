export interface PartRow {
  page: number;
  fig_no: string;
  fig_name: string;
  ref_no: string;
  part_no: string;
  description: string;
  remarks: string;
  [key: string]: string | number;
}

export interface FigureItem {
  fig_no: string;
  fig_name: string;
  first_page: number;
}

export interface PartMetadataItem {
  page: number;
  fig_no: string;
  fig_name?: string;
  part_name?: string;
  ref_no: string;
  part_no: string;
  clean_part_no: string;
  description: string;
  brand?: string;
  model_code?: string;
  model?: string;
  series?: string;
  compatible_models: string;
  image_filename: string;
  product_title: string;
  meta_title?: string;
  meta_description?: string;
  meta_long_description: string;
  meta_desc_chars?: number;
  long_desc_length?: number;
  product_description?: string;
  product_desc_words?: number;
  remarks?: string;
}

export interface MetaTemplateConfig {
  brand: string;
  style: 'ecommerce' | 'marketplace' | 'minimalist' | 'custom';
  customTitle?: string;
  customLongDesc?: string;
}

export interface ExtractionStatus {
  job_id: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  current_page: number;
  total_pages: number;
  current_fig_no: string;
  current_fig_name: string;
  model_columns: string[];
  total_rows: number;
  figures: FigureItem[];
  rows?: PartRow[];
  error?: string | null;
}

