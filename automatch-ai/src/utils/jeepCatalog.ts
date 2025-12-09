export interface JeepCatalogEntry {
  id: string;
  model: string;
  year: string;
  power: string;
  drivetrain: string;
  fuel: string;
  summary: string;
  image?: string;
}

export const jeepCatalog: JeepCatalogEntry[] = [
  {
    id: "jeep-wrangler-2024",
    model: "Jeep Wrangler Rubicon",
    year: "2024",
    power: "200 kW (272 PS)",
    drivetrain: "4x4, Untersetzung",
    fuel: "Benzin",
    summary: "Ikonischer Offroader mit entfernbaren Türen und Dach, maximiert auf Trails und Fels." ,
    image: "https://images.unsplash.com/photo-1617469165785-6f8fbd3d7321?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "jeep-grand-cherokee-2024",
    model: "Jeep Grand Cherokee 4xe",
    year: "2024",
    power: "280 kW (380 PS) Systemleistung",
    drivetrain: "Allrad, Luftfederung optional",
    fuel: "Plug-in-Hybrid",
    summary: "Komfortabler Langstrecken-SUV mit E-Boost und echter Jeep-Geländefähigkeit.",
    image: "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "jeep-compass-2023",
    model: "Jeep Compass Trailhawk",
    year: "2023",
    power: "176 kW (239 PS)",
    drivetrain: "4x4 mit Terrain-Select",
    fuel: "Plug-in-Hybrid",
    summary: "Kompakter SUV, ausgewogen zwischen Stadt und Waldwegen, mit Trailhawk-Offroad-Modus.",
    image: "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "jeep-renegade-2022",
    model: "Jeep Renegade Upland",
    year: "2022",
    power: "96 kW (130 PS)",
    drivetrain: "Front- oder Allrad je nach Ausführung",
    fuel: "Benzin / Diesel",
    summary: "Kleinster Jeep mit hohem Nutzwert in der Stadt, dennoch mit markentypischer Sitzposition und Bodenfreiheit.",
    image: "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "jeep-avenger-2024",
    model: "Jeep Avenger",
    year: "2024",
    power: "115 kW (156 PS)",
    drivetrain: "Frontantrieb, elektrische Version verfügbar",
    fuel: "Elektro",
    summary: "Vollelektrischer City-SUV mit Jeep-Designsprache und kompaktem Footprint.",
    image: "https://images.unsplash.com/photo-1525609004556-c46c7d6cf023?auto=format&fit=crop&w=800&q=60",
  },
];

export const findJeepModels = () => jeepCatalog;
