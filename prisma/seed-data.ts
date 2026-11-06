/* Reference data shared by the demo seed and the production bootstrap. */
export type Attr = [key: string, label: string, type?: string, options?: string, extra?: { unit?: string; required?: boolean; isPrivate?: boolean; filterable?: boolean }];
export type Cat = { name: string; slug: string; icon: string; highValue?: boolean; bps: number; attrs: Attr[]; subs?: { name: string; slug: string; attrs?: Attr[] }[] };

export const CATEGORIES: Cat[] = [
  {
    name: "Cars & Vehicles", slug: "cars-vehicles", icon: "🚗", highValue: true, bps: 100,
    attrs: [
      ["make", "Make", "text", undefined, { required: true, filterable: true }],
      ["model", "Model", "text", undefined, { required: true }],
      ["year", "Year", "number", undefined, { required: true, filterable: true }],
      ["kilometres", "Kilometres", "number", undefined, { unit: "km", required: true }],
      ["fuel", "Fuel type", "select", "Petrol,Diesel,Hybrid,Electric,LPG", { filterable: true }],
      ["transmission", "Transmission", "select", "Automatic,Manual", { filterable: true }],
      ["bodyType", "Body type", "select", "Sedan,Hatch,SUV,Ute,Wagon,Coupe,Convertible,Van,Other"],
      ["registration", "Registration number", "text"],
      ["regoExpiry", "Registration expiry", "date"],
      ["vin", "VIN", "text", undefined, { isPrivate: true }],
    ],
    subs: [
      { name: "Cars", slug: "cars" },
      { name: "Motorcycles", slug: "motorcycles", attrs: [["engineCc", "Engine capacity", "number", undefined, { unit: "cc" }]] },
      { name: "Trucks & Vans", slug: "trucks-vans" },
    ],
  },
  {
    name: "Property & Real Estate", slug: "property-real-estate", icon: "🏠", highValue: true, bps: 50,
    attrs: [
      ["propertyType", "Property type", "select", "House,Apartment,Townhouse,Land,Commercial,Rural", { required: true, filterable: true }],
      ["saleType", "Sale or rent", "select", "For sale,For rent", { required: true, filterable: true }],
      ["bedrooms", "Bedrooms", "number", undefined, { filterable: true }],
      ["bathrooms", "Bathrooms", "number"],
      ["parking", "Parking spaces", "number"],
      ["landSize", "Land size", "number", undefined, { unit: "m²" }],
      ["buildingSize", "Building size", "number", undefined, { unit: "m²" }],
    ],
    subs: [{ name: "Houses", slug: "houses" }, { name: "Apartments", slug: "apartments" }, { name: "Land", slug: "land" }, { name: "Commercial", slug: "commercial" }],
  },
  {
    name: "Mobile Phones", slug: "mobile-phones", icon: "📱", bps: 500,
    attrs: [
      ["brand", "Brand", "select", "Apple,Samsung,Google,Oppo,Motorola,Nokia,Other", { required: true, filterable: true }],
      ["model", "Model", "text", undefined, { required: true }],
      ["storage", "Storage", "select", "64GB,128GB,256GB,512GB,1TB", { filterable: true }],
      ["colour", "Colour", "text"],
      ["batteryHealth", "Battery health", "number", undefined, { unit: "%" }],
      ["networkLock", "Network lock", "select", "Unlocked,Telstra,Optus,Vodafone"],
      ["warranty", "Warranty", "text"],
    ],
  },
  {
    name: "Computers & Laptops", slug: "computers-laptops", icon: "💻", bps: 500,
    attrs: [
      ["brand", "Brand", "text", undefined, { required: true, filterable: true }],
      ["model", "Model", "text"],
      ["processor", "Processor", "text"],
      ["ram", "RAM", "select", "4GB,8GB,16GB,32GB,64GB"],
      ["storage", "Storage", "text"],
      ["graphics", "Graphics", "text"],
      ["screenSize", "Screen size", "number", undefined, { unit: "in" }],
      ["os", "Operating system", "select", "Windows,macOS,Linux,ChromeOS,None"],
    ],
  },
  {
    name: "Electronics", slug: "electronics", icon: "📺", bps: 500,
    attrs: [["brand", "Brand", "text", undefined, { filterable: true }], ["model", "Model", "text"], ["warranty", "Warranty", "text"]],
    subs: [
      { name: "TVs", slug: "tvs", attrs: [["screenSize", "Screen size", "number", undefined, { unit: "in" }], ["resolution", "Resolution", "select", "HD,Full HD,4K,8K"], ["display", "Display technology", "select", "LED,QLED,OLED,Mini-LED"], ["smart", "Smart TV", "boolean"]] },
      { name: "Audio", slug: "audio" },
      { name: "Cameras", slug: "cameras" },
      { name: "Gaming", slug: "gaming" },
    ],
  },
  {
    name: "Furniture & Home Appliances", slug: "furniture-home-appliances", icon: "🛋️", bps: 500,
    attrs: [],
    subs: [
      { name: "Furniture", slug: "furniture", attrs: [["type", "Type", "text"], ["material", "Material", "text"], ["dimensions", "Dimensions", "text"], ["colour", "Colour", "text"], ["collection", "Collection / delivery", "select", "Pick-up only,Delivery available,Both"]] },
      { name: "Appliances", slug: "appliances", attrs: [["brand", "Brand", "text"], ["model", "Model", "text"], ["capacity", "Capacity", "text"], ["energyRating", "Energy rating", "select", "1,2,3,4,5,6,7"], ["dimensions", "Dimensions", "text"], ["warranty", "Warranty", "text"]] },
    ],
  },
  {
    name: "Machinery & Equipment", slug: "machinery-equipment", icon: "🚜", bps: 300,
    attrs: [["manufacturer", "Manufacturer", "text", undefined, { required: true }], ["model", "Model", "text"], ["year", "Year", "number"], ["hours", "Operating hours", "number", undefined, { unit: "hrs" }], ["capacity", "Capacity", "text"], ["specs", "Specifications", "text"]],
  },
  {
    name: "Other Products", slug: "other-products", icon: "📦", bps: 500,
    attrs: [["brand", "Brand", "text"], ["specs", "Specifications", "text"]],
    subs: [
      { name: "Fashion", slug: "fashion", attrs: [["brand", "Brand", "text"], ["size", "Size", "text"], ["colour", "Colour", "text"], ["material", "Material", "text"], ["gender", "Category", "select", "Women,Men,Unisex,Kids"]] },
      { name: "Jewellery", slug: "jewellery", attrs: [["type", "Type", "text"], ["metal", "Metal", "text"], ["weight", "Weight", "number", undefined, { unit: "g" }], ["gemstone", "Gemstone", "text"], ["certification", "Certification", "text"]] },
      { name: "General", slug: "general" },
    ],
  },
];

export const PAGES: [string, string, string][] = [
  ["about", "About Us", "SellEasy is an Australian verified marketplace. Every seller is identity-checked and every listing is reviewed before it goes live.\n\nWe also host approved prize promotions run by verified sellers, with fully auditable draws."],
  ["contact", "Contact Us", "Email: support@selleasy.example\nPhone: 1300 000 000 (Mon–Fri, 9am–5pm AEST)\n\nOr use the form below."],
  ["terms", "Terms & Conditions", "PLACEHOLDER — these terms must be drafted and reviewed by an Australian lawyer before launch.\n\n1. Accounts\n2. Seller obligations\n3. Listings and approval\n4. Payments, fees and commission\n5. Promotions and draws\n6. Liability\n7. Governing law: the laws of the state in which the operator is registered."],
  ["privacy", "Privacy Policy", "PLACEHOLDER — must comply with the Privacy Act 1988 (Cth) and the Australian Privacy Principles. Describe what personal information is collected (identity, contact, verification documents, payment references), why, how it is stored and protected, and how users can access or correct it."],
  ["refund-policy", "Refund Policy", "PLACEHOLDER — must reflect Australian Consumer Law guarantees.\n\nProduct orders: request a refund from your order page; the platform reviews every request.\nTicket purchases: refundable until ticket sales close and the entry register is locked, or if a campaign is cancelled."],
  ["responsible-participation", "Responsible Participation & Eligibility", "Promotions are open to Australian residents aged 18+ in the states listed for each campaign. Paid entry is not available in states where it is not permitted.\n\nPlease participate responsibly. If gambling is causing you harm, contact Gambling Help Online on 1800 858 858 or visit gamblinghelponline.org.au.\n\nEach campaign has its own terms, permit details (where required), draw date and prize delivery details."],
];
