export enum QuoteCategory {
  Tech = "Tech",
  Philosophy = "Philosophy",
  PopCulture = "PopCulture",
  Nonsense = "Nonsense",
  Corporate = "Corporate",
  Niche = "Niche"
}

export interface Quote {
  id: string;
  text: string;
  category: QuoteCategory;
  tags: string[];
  punLevel: number;
}
