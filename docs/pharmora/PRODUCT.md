# Pharmora — Product

**Tagline:** AI-Powered Pharmaceutical Business Platform  
**Phase:** Frontend prototype only (no backend, database, or live integrations)

## Vision

Pharmora is a multi-tenant SaaS platform that unifies customers, distributors, sales teams, management, product data, documents, orders, quotations, business intelligence, and AI into one pharmaceutical commercial workspace.

The first demonstration tenant is **MediCrest Pharmaceuticals Limited (Kenya)**. The product is not customer-specific: tenant branding, catalogue, and copy come from configuration.

## Positioning

Premium enterprise SaaS for pharmaceutical manufacturers, distributors, medical suppliers, and healthcare companies. The Phase 1 frontend should feel presentation-ready for a manufacturer’s executive team.

## Long-term modules (not all built in Phase 1)

1. AI Product Assistant  
2. Product Intelligence  
3. Customer Management  
4. Lead Management  
5. RFQ Management  
6. Quotations  
7. Orders  
8. Distributor Portal  
9. WhatsApp AI Assistant  
10. Document Intelligence  
11. AI Employee Copilot  
12. Executive Intelligence  
13. Sales Analytics  
14. Product Analytics  
15. Inventory Intelligence  
16. Production Intelligence  
17. Regulatory Intelligence  

## Phase 1 product surface (frontend + mock data)

| Area | Route (planned) | Phase 1 intent |
| --- | --- | --- |
| Executive dashboard | `/dashboard` | Full interactive prototype |
| AI Assistant | `/ai-assistant` | Enterprise workspace UI + mock responses |
| Products | `/products`, `/products/[product]` | Catalogue + intelligence page |
| RFQs | `/rfqs`, `/rfqs/[rfq]` | Pipeline table + detail |
| Customers | `/customers`, `/customers/[customer]` | CRM list + 360 |
| Quotations | `/quotes` | List + statuses |
| Orders | `/orders` | List + statuses |
| Documents | `/documents` | Categories + mock AI search |
| Analytics | `/analytics` | Tabs + elegant charts |
| Distributor portal | `/distributor` | Lightweight separate nav |
| Public ask | `/ask` | Embeddable public AI UI |
| Leads / Operations / Admin | nav only | Coming soon where incomplete |

## Tenant model

- **Product:** Pharmora (reusable SaaS)  
- **Demo tenant:** MediCrest Pharmaceuticals Limited  
- **Brand (tenant):** MediCrest Pharmaceuticals  
- **Tenant tagline:** Better Medicine Better Life  
- **Country:** Kenya  

Use a small curated mock dataset (demo data, not real transactions). Do not scrape sites. Do not invent medical claims or give medical advice.

## Non-goals (this frontend phase)

Backend, database, production API routes, real auth, OpenAI/Gemini, WhatsApp, ERP, payments, credentials, or fake production-looking authentication.

## Quality bar

Every screen answers: what is this page, what matters most, what should the user do next. Prefer hierarchy and density over decorative clutter.
