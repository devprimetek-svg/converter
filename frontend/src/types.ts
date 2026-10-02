export interface PartRow {
  page: number;
  fig_no: string;
  fig_name: string;
  catalogue_code?: string;
  model_name?: string;
  pic?: string;
  image?: string;
  is_parent?: boolean;
  parent_fig_name?: string;
  ref_no: string;
  part_no: string;
  description: string;
  remarks: string;
  // Phase 2: Simplify ERP Master Fields
  hsn_code?: string;
  gst_rate?: number;
  mrp?: number;
  cost_price?: number;
  dealer_price?: number;
  margin_pct?: number;
  rack_bin?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface FigureItem {
  fig_no: string;
  fig_name: string;
  first_page: number;
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

