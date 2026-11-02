# Entity-relationship diagrams

These diagrams show relationships and the key columns only. Full column
lists live in [tables/](tables/). Every tenant table also carries
`organization_id` (omitted below) and references its parents through
composite `(organization_id, *_id)` foreign keys.

## Overview

```mermaid
erDiagram
    organizations ||--o{ organization_members : employs
    organizations ||--o{ clients : serves
    organizations ||--o{ crews : fields
    organizations ||--o{ services : offers
    organizations ||--o{ tax_rates : charges
    organizations ||--o{ requests : receives
    clients |o--o{ requests : "matched later"
    services ||--o{ requests : "requested"
    requests |o--o{ quotes : "revisions"

    clients ||--o{ properties : owns
    clients ||--o{ client_contacts : has
    clients ||--o{ client_portal_users : "logs in as"

    clients ||--o{ quotes : receives
    properties ||--o{ quotes : "quoted at"
    quotes |o--o| jobs : "converts to"
    quotes ||--o{ quote_share_tokens : "magic links"
    properties ||--o{ jobs : "work at"
    jobs ||--o{ visits : materializes

    crews ||--o{ routes : drives
    crews |o--o{ service_areas : "owns area"
    service_areas |o--o{ properties : covers
    routes ||--o{ route_stops : orders
    visits ||--o| route_stops : "assigned by"

    clients ||--o{ invoices : billed
    invoices ||--o{ invoice_line_items : contains
    invoices ||--o{ invoice_visits : bills
    visits ||--o{ invoice_visits : "billed by"
    invoices ||--o{ payments : "paid by"

    organization_members ||--o{ shifts : works
    visits ||--o{ visit_time_entries : "time on"
```

## Tenancy, people & clients

```mermaid
erDiagram
    organizations {
        uuid id PK
        citext slug UK
        text timezone
        char currency
        jsonb settings
        text stripe_account_id
    }
    profiles {
        uuid id PK "= auth.users.id"
        text full_name
    }
    organization_members {
        uuid id PK
        uuid user_id FK "nullable"
        org_role role
        member_status status
        text display_name
    }
    organization_invitations {
        uuid id PK
        citext email
        org_role role
        text token_hash UK
        timestamptz expires_at
    }
    member_pay_rates {
        uuid id PK
        uuid member_id FK
        bigint hourly_rate_cents
        date effective_from
    }
    clients {
        uuid id PK
        client_kind kind
        client_status status
        text display_name
        citext email
        boolean tax_exempt
    }
    client_contacts {
        uuid id PK
        uuid client_id FK
        text name
        boolean is_primary
    }
    properties {
        uuid id PK
        uuid client_id FK
        text address_line1
        geography location
        uuid service_area_id FK "derived"
        text access_notes
    }
    client_portal_users {
        uuid id PK
        uuid client_id FK
        uuid user_id FK
    }

    organizations ||--o{ organization_members : ""
    organizations ||--o{ organization_invitations : ""
    profiles ||--o{ organization_members : "user_id"
    organization_members ||--o{ member_pay_rates : ""
    organizations ||--o{ clients : ""
    clients ||--o{ client_contacts : ""
    clients ||--o{ properties : ""
    clients ||--o{ client_portal_users : ""
    profiles ||--o{ client_portal_users : "user_id"
```

## Work: catalog, quotes, jobs, visits, routing, time

```mermaid
erDiagram
    services {
        uuid id PK
        text name
        service_unit unit
        bigint default_price_cents
    }
    tax_rates {
        uuid id PK
        text name
        numeric percentage
    }
    quotes {
        uuid id PK
        text number UK
        uuid client_id FK
        uuid property_id FK
        uuid request_id FK
        integer revision
        quote_status status
        bigint total_cents
    }
    quote_share_tokens {
        uuid id PK
        uuid quote_id FK
        text token_hash UK
        timestamptz expires_at
        timestamptz revoked_at
        quote_delivery_status delivery_status
    }
    quote_line_items {
        uuid id PK
        uuid quote_id FK
        uuid service_id FK
        bigint unit_price_cents
        boolean is_optional
    }
    jobs {
        uuid id PK
        text number UK
        uuid property_id FK
        uuid quote_id FK "unique"
        job_kind kind
        text rrule
        job_billing_mode billing_mode
        date generated_through
    }
    job_line_items {
        uuid id PK
        uuid job_id FK
        bigint unit_price_cents
    }
    visits {
        uuid id PK
        uuid job_id FK
        uuid property_id FK
        date occurrence_date
        date scheduled_date
        visit_status status
        boolean is_exception
    }
    crews {
        uuid id PK
        text name
        geography default_start_location
    }
    crew_members {
        uuid crew_id PK
        uuid member_id PK
    }
    routes {
        uuid id PK
        uuid crew_id FK
        date route_date
        route_status status
    }
    route_members {
        uuid route_id PK
        uuid member_id PK
    }
    route_stops {
        uuid id PK
        uuid route_id FK
        uuid visit_id FK "unique"
        int sequence
    }
    optimization_runs {
        uuid id PK
        date route_date
        optimization_status status
    }
    shifts {
        uuid id PK
        uuid member_id FK
        timestamptz clock_in
        timestamptz clock_out
    }
    visit_time_entries {
        uuid id PK
        uuid visit_id FK
        uuid member_id FK
        timestamptz started_at
    }
    attachments {
        uuid id PK
        text storage_path
        uuid visit_id FK "one owner FK set"
    }

    services ||--o{ quote_line_items : ""
    services ||--o{ job_line_items : ""
    tax_rates ||--o{ quote_line_items : "via quote_line_item_taxes"
    quotes ||--o{ quote_line_items : ""
    quotes |o--o| jobs : ""
    jobs ||--o{ job_line_items : ""
    jobs ||--o{ visits : ""
    crews ||--o{ crew_members : ""
    crews ||--o{ routes : ""
    routes ||--o{ route_members : ""
    routes ||--o{ route_stops : ""
    visits ||--o| route_stops : ""
    optimization_runs ||--o{ routes : ""
    visits ||--o{ visit_time_entries : ""
    visits ||--o{ attachments : ""
    routes ||--o{ shifts : ""
```

## Money: invoices & payments

```mermaid
erDiagram
    invoices {
        uuid id PK
        text number UK
        uuid client_id FK
        invoice_status status
        date due_date
        date period_start
        date period_end
        bigint total_cents
        bigint balance_cents
    }
    invoice_line_items {
        uuid id PK
        uuid invoice_id FK
        uuid job_id FK
        uuid visit_id FK
        bigint amount_cents
    }
    invoice_visits {
        uuid invoice_id PK
        uuid visit_id PK "unique where not is_void"
        boolean is_void
    }
    invoice_line_item_taxes {
        uuid line_item_id PK
        uuid tax_rate_id PK
        numeric percentage
        bigint amount_cents
    }
    payments {
        uuid id PK
        uuid invoice_id FK
        payment_method method
        payment_status status
        bigint amount_cents
        text stripe_payment_intent_id UK
    }
    stripe_events {
        text id PK "evt_..."
        text type
        jsonb payload
    }

    clients ||--o{ invoices : ""
    invoices ||--o{ invoice_line_items : ""
    invoices ||--o{ invoice_visits : ""
    visits ||--o{ invoice_visits : ""
    invoice_visits ||--o{ invoice_line_items : "(invoice_id, visit_id)"
    invoice_line_items ||--o{ invoice_line_item_taxes : ""
    tax_rates ||--o{ invoice_line_item_taxes : ""
    invoices ||--o{ payments : ""
```

## Service areas

```mermaid
erDiagram
    service_regions {
        uuid id PK
        text name "unique per org"
        geometry boundary "MultiPolygon, nullable"
        geometry center "Point"
        geometry bbox "Polygon"
    }
    service_areas {
        uuid id PK
        uuid crew_id FK "nullable"
        uuid region_id FK "nullable"
        text name
        int priority
        geometry boundary "MultiPolygon 4326"
        float area_m2 "generated"
        timestamptz archived_at
    }
    service_area_rotations {
        uuid service_area_id PK
        smallint weekday PK "1-7"
        uuid crew_id FK
    }
    properties {
        uuid id PK
        geography location
        uuid service_area_id FK "derived"
    }
    crews {
        uuid id PK
    }

    service_regions |o--o{ service_areas : frames
    crews |o--o{ service_areas : owns
    service_areas ||--o{ service_area_rotations : ""
    crews ||--o{ service_area_rotations : "rotation crew"
    service_areas |o--o{ properties : "covers (ST_Covers)"
```
