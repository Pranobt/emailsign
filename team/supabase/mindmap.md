# Financial Health Checkup – Lead Journey

```mermaid
flowchart TD

A[Payment Successful] --> B[Redirect to Financial Health Checkup Page]

B --> C{User Action}

C -->|Fill Form| D[Step 1: Enter Financial Numbers]

D --> E[Step 2: Dynamic Financial Questions]

E --> F[Generate Financial Health Score]

F --> G[Display 6 Pillar Breakdown]

G --> H[Show Action Points + Financial Gaps]

H --> I[CTA: Book Financial Review Meeting]

H --> J[CTA: Download Finnovate App]

I --> K[Meeting Booked]

K --> L[Meeting Preparation Email]

L --> M[Financial Health Review Meeting]

M --> N[Portfolio Analysis + Benchmark Comparison]

N --> O[Share Financial Health Report PDF]

O --> P{Interested in Wealth Management}

P -->|Yes| Q[Wealth Management Onboarding]

P -->|Not Now| R[Enter Wealth Nurture Track]



%% Nurture Track

R --> S[Weekly Financial Insight Emails]

S --> T[Monthly Portfolio Education Content]

T --> U[Webinar Invitations]

U --> V[Quarterly Portfolio Review Offer]

V --> W{Client Ready for Advisory?}

W -->|Yes| Q

W -->|No| S



%% Reminder Automation

B --> X[Instant WhatsApp + Email Confirmation]

X --> Y{Form Completed?}

Y -->|No| Z[1 Hour WhatsApp Reminder]

Z --> ZA{Still Not Completed?}

ZA -->|Yes| ZB[24 Hour Email Reminder]

ZB --> ZC[48 Hour Final WhatsApp Reminder]

Y -->|Yes| ZD[Send Score Ready Message]

ZD --> ZE{Meeting Booked?}

ZE -->|No| ZF[12 Hour Meeting Reminder]

ZE -->|Yes| K