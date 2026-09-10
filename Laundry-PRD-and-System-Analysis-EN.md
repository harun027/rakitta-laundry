# PRD and System Analysis — Laundry Operations SaaS for Indonesia

**Version:** 1.3 · **Date:** 10 September 2026  
**Working name:** LaundryFlow — trademark and domain availability have not been checked.  
**Product owner:** Harun · **Status:** specification for discovery, estimation, design, implementation, and a pilot. This is not a claim of product–market fit or a guarantee of legal compliance.

**Changes in v1.1:** selected Supabase PostgreSQL, Supabase Auth, and Supabase Storage; designated the Free plan for development/demos; clarified capacity, security, and backup requirements for live operations. No accounts or infrastructure were created through that document update.

**Changes in v1.2:** separated the website specification (Section 22), mobile apps specification (Section 23), and shared backend/hosting without a mandatory VPS (Section 24). Selected Next.js for the website/API, React Native + Expo for Android/iOS, and TypeScript for both. Website and mobile releases have separate scopes and gates.

**Changes in v1.3:** translated the complete PRD into English. Product scope, requirement IDs, system rules, calculations, platform separation, and acceptance criteria are retained. Translating this document does not change the product's Indonesian-language launch requirement.

## Executive summary

The product helps weight-based and simple per-item laundries record orders, control processing and physical packages, accept payments, hand over laundry, and reconcile cash through **a website and Android/iOS mobile apps sharing one backend and database**. The initial audience is businesses with 1–3 outlets, each processing laundry on its own premises. Centralized workshops and transfers between outlets are outside the initial release. Mobile apps serve owners and staff; customers use website tracking.

The value to prove is: **orders are easier to trace, deadlines are more visible, calculations can be checked, and cash discrepancies can be investigated.** The product does not promise to eliminate lost items or fraud. Software only works when labeling, inspections, and recording procedures are followed.

Key architectural decisions:

1. Separate the order lifecycle, work progress, payments, and physical handover. A single “Completed” status must not represent all four.
2. Calculate money and weight deterministically on the server. AI is unnecessary for core functions.
3. Store order prices as snapshots; changing a service price must not change old receipts.
4. Do not silently delete payments, refunds, price revisions, or significant changes. Use corrective transactions and audit records.
5. Use a modular monolith with a relational database and tenant/outlet isolation. Microservices are unnecessary for the MVP.
6. Start online-first with an emergency receipt procedure. Do not claim full offline transaction support.
7. Initial WhatsApp messages are prepared links/messages sent by a user. Clicking the button is not proof of delivery.
8. Test printers against specific device combinations. Browser support does not guarantee that every Bluetooth printer works.

### How to read this document

- **P0:** required for the paid operational beta within the defined scope.
- **P1:** after P0 is stable, or when pilot evidence justifies prioritization.
- **P2:** expansion, not a release commitment.
- **Design decision:** a rule established in this document; changes require a change-log entry.
- **Hypothesis:** requires observation or pilot validation; not a fact about every laundry.
- **Target:** an internal test threshold, not an industry benchmark or an achieved result.

## Contents

1. Context, opportunity, and evidence
2. Segments, personas, and field validation
3. Problem–solution–success evidence matrix
4. Objectives, scope boundaries, and priorities
5. Operating model and business rules
6. State machines and system invariants
7. Functional requirements and acceptance criteria
8. Information architecture and UX specifications
9. Financial records, order pricing, and calculation examples
10. Permissions and security
11. Technical architecture and data flow
12. Data model and integrity
13. API contracts, concurrency, and idempotency
14. Integrations, printing, and connection recovery
15. Reporting and analytics
16. Nonfunctional requirements, backups, and observability
17. Testing strategy and UAT
18. Migration, onboarding, and SOPs
19. SaaS monetization and unit economics
20. Roadmap, dependencies, and release gates
21. Risks, open decisions, and sources
22. Website PRD — Next.js
23. Mobile Apps PRD — React Native + Expo
24. Shared system, code structure, and hosting

---

## 1. Context, opportunity, and evidence

### 1.1 Available evidence

Smartlink publishes laundry management features and a pricing model; Dicatetin publishes tracking, notification, and multi-user features. This establishes that the product category exists, not that a new product will automatically sell. Vendor savings figures and customer counts are not treated as independently verified outcomes. [S1](https://smartlink.id/fitur), [S2](https://dicatetin.com/id), [S3](https://smartlink.id/biaya).

Opportunity hypothesis: small laundries may need an easier-to-learn application, onboarding assistance, and clear transaction controls. Test that hypothesis rather than claiming competitors are difficult to use. Low pricing, mobile access, and WhatsApp are not unique differentiators.

### 1.2 Positioning to test

“One place to record laundry, locate packages, check payments, and close the daily cash register.”

Potential differentiation: a concise cashier workflow, unambiguous statuses, package records that follow physical handling procedures, and safe recovery from connection failures. Measure time and errors before and after adoption, not the number of features.

### 1.3 Business decision

A prototype and limited pilot are justified. There is no basis for claiming this will be Indonesia's best-selling SaaS. Do not build the entire roadmap before obtaining actual usage and payment commitments. Initial acquisition should focus on owners who can be interviewed and supported; access to industry communities is not assumed.

## 2. Segments, personas, and field validation

### 2.1 Initial ideal customer profile

- Independent laundry with 1–3 outlets, offering regular/express weight-based services and simple per-item services.
- Processing and storage take place at the receiving outlet; no transfers between outlets are required.
- Has an Android phone or laptop, a usable internet connection, and willingness to follow labeling procedures.
- Already processes orders; is not merely exploring a business idea.
- Will appoint a responsible person and run a 30-day pilot.
- For test planning only: 20–100 orders/day/outlet. Collect actual figures during discovery.

P0 excludes industrial hospital/hotel laundries, large linen contracts, specialized high-risk dry cleaning, coin-machine IoT, and franchises with centralized workshops. The system does not provide professional cleaning or chemical-handling instructions.

### 2.2 Personas and jobs to be done

| Persona | Primary job | Success indicator |
| --- | --- | --- |
| Owner | Check queues, receivables, cash, and staff activity without always being at the outlet | Can trace report totals to source transactions |
| Cashier | Receive laundry, calculate prices, record payments, and hand over packages | Correct, fast orders without duplicate entry |
| Production operator | Select the next job, record stages, and separate problem packages | Packages and instructions match the work |
| Supervisor | Approve corrections and investigate complaints/cash discrepancies | Decisions have reasons and audit trails |
| Laundry customer | Know when to collect laundry and how much remains payable | Clear status without installing an app |
| SaaS administrator | Manage business accounts, application subscriptions, and support | Does not need default access to laundry customers' data |

One person may hold multiple roles. Audit records still use individual identities rather than a shared “cashier” account.

### 2.3 Required discovery questions

1. Observe at least 10 drop-offs and 10 collections. Which steps are repetitive or error-prone?
2. How are minimum weight and rounding applied? Is the price known at initial drop-off?
3. Can an order contain several services or several bags?
4. When are labels removed, replaced, soaked, or lost?
5. Is laundry from different customers mixed? How is physical identity maintained?
6. How are advance payments, deposits, transfers, and payment on collection recorded?
7. Who checks transfers, approves discounts, and returns money?
8. How are partial collection, rewashing, and cancellation handled?
9. What happens when a machine breaks, electricity fails, internet disconnects, or work misses its deadline?
10. Which exact printers and devices are used? Test the actual models.
11. Is express service a separate rate or a surcharge? Are there taxes or additional charges?
12. Will the business actually pay? Offer a clearly scoped pilot rather than asking only for opinions.

If partial collection, full offline operation, or workshop transfers are essential to most candidate pilot businesses, revise the scope before onboarding. Do not obscure missing capabilities.

## 3. Problem–solution–success evidence matrix

The problems below remain operational hypotheses until observed. Priority reflects risks to money, goods, and business continuity.

| ID | Problem/root cause | Product solution | Required operating procedure | Test evidence |
| --- | --- | --- | --- | --- |
| M01 | Receipts get misplaced or order numbers mixed up | Unique order ID, search, digital receipt, labeled reprints | Match the number to the bag at every transfer | 100% of sampled orders can be found by number |
| M02 | Items get mixed up; only the receipt has a label | Bag IDs, package counts, QC, and rack locations | Use process-resistant labels suitable for the equipment; preserve identity | All pilot packages are labeled and count-checked at handover |
| M03 | Incorrect pricing because minimums/rounding are unclear | Price-rule snapshots; separate actual and billable weight | Cashier confirms the summary before acceptance | No deviations from pricing test fixtures |
| M04 | Express jobs run late because the queue lacks prioritization | Per-job due times, deadline sorting, overdue markers | Supervisor checks capacity and agrees changes to promises | Compare on-time completion with the baseline |
| M05 | Customers repeatedly ask for status | Minimal-data tracking and prepared status messages | Operators update stages promptly | Compare status inquiries per 100 orders before/after |
| M06 | Laundry is released before full payment | Outstanding-balance guard and owner credit approval | Verify the recipient and count every package | Every exception has approval and a reason |
| M07 | Transfer evidence is false or for the wrong amount | Pending verification; no balance change until checked | Check account transactions through the merchant's authorized access | A screenshot alone never marks an order paid |
| M08 | Cash does not appear to match order sales | Separate order value, money received, refunds, expenses, and opening cash | Physically count money at session opening/closing | Every discrepancy is explained or under investigation |
| M09 | Timeouts create duplicate orders/payments | Idempotency keys, result lookup, unsaved-state indicators | Check the first request before creating a second receipt | Repeated retries produce one transaction |
| M10 | Complaint origin and follow-up are unclear | Issue log, optional photos, rework, decision audit | Conduct QC with the customer when necessary | Every open issue has an owner and next action |
| M11 | Staff can erase mistakes or transactions | Corrections/reversals, RBAC, application-level append-only audit | Owner reviews anomalies; staff do not share accounts | No financial hard-deletion through the application |
| M12 | Application is too complicated for staff | Separate cashier/production views, safe defaults, optional fields | Short training and SOP cards | At least 90% complete core tasks without help after training |

Do not claim “100% loss prevention.” An initial photo of a weight-based order does not establish an item-by-item inventory. Per-garment traceability requires additional features and procedures in P2.

## 4. Objectives, scope boundaries, and priorities

### 4.1 Pilot product targets

- Median entry time for an existing customer's single-service order: ≤60 seconds after training; also report p90.
- Every payment and handover change records its actor and timestamp.
- Zero critical balance, duplicate-transaction, or cross-tenant data exposure defects before paid beta.
- Pilot at least 3 outlets from at least 2 businesses; this is not national market evidence.
- Target 80% of pilot outlet transactions recorded after week one, checked against comparison records.
- Measure paid retention after the pilot. Initial threshold: at least 3 of 5 paid pilot businesses renew and pay for the next period; repeat with a larger cohort.

### 4.2 Release scope

| P0 — operational beta | P1 — after stabilization | P2 — expansion |
| --- | --- | --- |
| Tenants/outlets and roles | Official WhatsApp Business Platform | Workshops/inter-outlet transfers |
| Weight/per-item services and price snapshots | Integrated dynamic laundry payments | Pickup/delivery and couriers |
| Multi-service orders and multiple bags | Package-level partial handover | Per-garment tracking, RFID |
| Per-line production stages, QC, racks | Printing through a tested printer bridge | Materials inventory and IoT |
| Deposits/full payment/manual verification/refunds | Prepaid weight packages with a ledger | Full accounting/payroll |
| Cash sessions and basic expenses | Designed offline transaction synchronization | Franchise/outlet commissions |
| Browser receipts, tracking, manual WhatsApp | Historical transaction migration | Marketing automation/loyalty |
| Issue log and rework | Capacity/performance analytics | Native customer app |
| Reports, exports, audit, backups | Additional defined accounting reports | Optional AI insights |
| Controlled manual SaaS billing for the pilot | Automated SaaS billing | Marketplace |

P0 supports multiple outlets within a business, but each order is processed and collected at its receiving outlet. P0 has no cross-outlet movement of stock, goods, or cash.

Domain priorities P0/P1/P2 differ from platform sequencing: **W0** is the operational website release; **M0** is the subsequent operational mobile release. Domain P0 administration may be accessed through the website from M0; mobile does not need to duplicate every administration screen. Android comes first, then iOS from the same React Native project after device testing. A native customer app remains P2.

## 5. Operating model and business rules

### 5.1 Domain objects

- **Tenant/business:** data ownership and SaaS contract boundary.
- **Outlet:** working location, receipt numbering, prices, opening hours, and cash.
- **Customer:** minimal customer identity within one business.
- **Order:** service agreement and charges for one visit.
- **Order line:** service, quantity/weight, price, and due time combination.
- **Work item:** execution of an order line, with a workflow snapshot and rework history.
- **Intake/production bag:** container identity from drop-off, linked to one order and one work item in P0.
- **Final package:** packed laundry linked to one order; may contain several work items from that order through content relationships.
- **Payment/receipt:** money actually received and verified.
- **Charge adjustment:** correction to the bill, distinct from refunding money.
- **Handover:** physical release to the customer or recipient.
- **Cash session:** opening through closing of one outlet cash drawer.

### 5.2 Order intake

1. Cashier selects the active outlet and opens a cash session if accepting cash.
2. Finds the customer by name/number or creates a new customer. Phone number is optional; customers without phones can receive paper receipts.
3. Records services, weight/quantity, handling instructions, bags, and relevant initial condition.
4. System calculates the price and suggested deadline. Cashier confirms minimums and rounding with the customer.
5. Accepts a deposit/full payment if applicable, using an atomic server transaction for immediate cash payment.
6. Order confirmation generates the official number, price snapshot, due time, initial charge, work items, and audit record.
7. Labels bags and sends/prints the receipt when needed. Printing failure does not cancel an already saved order.

A draft is not an official order: it does not establish recorded custody, add charges, or receive an official number. If goods are accepted during an outage, use a uniquely referenced emergency receipt and reconcile later.

### 5.3 Production and QC

- Default wash-and-iron workflow: queued → washing → drying → ironing → QC → ready. Iron-only: queued → ironing → QC → ready. Wash-and-fold: queued → washing → drying → folding → QC → ready.
- Store the workflow as a snapshot when creating the work item. Service changes do not alter existing workflows.
- A work item may have several bags. P0 stage changes apply to every bag in that work item; if timing/processing differs, split order lines at intake.
- The queue shows due time, priority, service, bag IDs, and relevant instructions, not customer balances or phone numbers.
- QC checks identity, condition, and package counts. Do not automatically compare initial wet weight with final weight as proof of loss.
- Packing records final package IDs and rack locations. A package must not contain goods from different orders.
- Failed QC allows a supervisor to create reasoned rework to the appropriate stage. Rework does not automatically create charges.
- An order becomes ready only when all active work items are ready, every package is recorded, and no blocking issue remains.

### 5.4 Collection

- Cashier searches the receipt number, name, or relevant reference. A public tracking QR is not proof of collection rights.
- Verify the recipient under the outlet SOP: receipt and customer confirmation, or supervisor verification for a lost receipt.
- Check all packages, counts, balance, and issues. By default, block release if work is not ready, a blocking issue exists, or the balance is positive.
- An owner/supervisor with credit permission may approve release before payment, subject to an amount limit and recorded reason. Receivables remain; the order is not automatically marked paid.
- P0 releases all packages together. Partial collection is rejected with an explanation; it is a P1 requirement.
- Record a minimal recipient name, whether they are a representative, the verification method, actor, and time. Do not require a national ID photo.

### 5.5 Deadlines and capacity

- Store UTC timestamps; display in the outlet timezone: Asia/Jakarta, Asia/Makassar, or Asia/Jayapura.
- P0 calculates SLAs in elapsed calendar hours, such as 48 hours after acceptance. Holidays are not automatically excluded.
- If the result falls outside collection hours, warn the cashier; they choose a valid time and record an override. Print the final agreed promise on the receipt.
- Order due time is the latest active line due time for combined collection. Work queues still use individual due times so express jobs remain visible.
- Retain original_promised_at, current_promised_at, and change history. Rescheduling must not erase lateness against the original promise.
- “Production overdue” differs from “ready, not collected.” Ready/uncollected reminders start at ready_at; the initial threshold of 3 calendar days is configurable, not universal.
- P0 does not promise automated machine-capacity optimization.

### 5.6 Corrections, cancellations, and complaints

- Authorized creators may edit drafts freely; draft hard-deletion may retain an audit metadata record.
- After acceptance, every weight/price change creates a numbered revision, reason, new snapshot, and charge delta. Previous receipt versions remain traceable.
- Cashiers cannot change official order amounts without supervisor approval. Nonfinancial note changes are also audited.
- Once processing starts, full cancellation requires a supervisor/owner. Charges for completed work require an explained settlement, not an assumed zero amount.
- Service cancellation, money refund, and physical return are separate actions. A cancelled order may still require a refund or return of goods.
- Refunds do not automatically reduce prices. Use a charge credit when reducing the bill; Section 9 defines the source-of-truth formula.
- Lost/damaged issues block release until a decision is recorded. Compensation follows the outlet's reviewed policy; do not hardcode “10× the cleaning fee.”
- Rewashing after collection creates a case linked to the original order, with new physical intake and labels. Do not reopen old handover history or duplicate revenue.
- Uncollected goods do not automatically become laundry property, and the system must not dispose of them.

### 5.7 Review clarification: readiness, rework, and custody

- Distinguish `first_ready_at` (immutable first-ready history) from `current_ready_at` (readiness in the current cycle). If a ready order enters rework before handover, clear current_ready_at, increment ready_cycle, and invalidate readiness of affected packages. Preserve all previous events. Uncollected-ready age uses current_ready_at; first-completion evaluation uses first_ready_at alongside rework rate.
- After rework, repeat QC and packing. Opened packages become VOIDED/REPACKED; replacements receive new codes and predecessor links. Old IDs cannot be used for handover. Do not delete earlier bag history.
- Post-handover rework has separate custody: REQUESTED → RECEIVED → IN_PROGRESS → READY → RETURNED; REQUESTED can become CANCELLED. Once goods are received, close the case only after physical return or an authorized exceptional resolution. Do not reuse the primary order handover row.
- Additional entities: `rework_receipts`, `rework_packages`, and `rework_returns`, linked by rework_case_id; one return per case in P0. Labels show the original order and case number. A rework case may contain part of the original order, but its contents are released together; this differs from partial collection of a normal order.
- Free rework creates no new charge. Additional paid work requires a new order with customer confirmation and a link to the case.
- Cancellation with goods still IN_CUSTODY requires a `custody_return` recording recipient, packages, time, and verification. It is not a completed-service handover. Changing the lifecycle cannot mark goods returned.
- Rework and custody returns remain available for existing orders when the subscription is restricted, so application billing does not strand customer goods.

## 6. State machines and system invariants

### 6.1 Separate status dimensions

| Dimension | Main values | Rule |
| --- | --- | --- |
| Order lifecycle | DRAFT, ACTIVE, CANCELLED | Confirmation changes DRAFT→ACTIVE; authorized cancellation preserves child records |
| Work item | QUEUED, production stages, QC, READY, CANCELLED | Follow the workflow snapshot; reasoned events handle rework |
| Blocking issue | OPEN, RESOLVED | Separate from processing stage; can block selected transitions |
| Physical fulfillment | IN_CUSTODY, HANDED_OVER, RETURNED_ON_CANCEL | Atomic release; partial release unavailable in P0 |
| Derived settlement | UNPAID, PARTIAL, SETTLED, CREDIT_DUE, ZERO_CHARGE | Computed from net charges and receipts, never a manual toggle |
| Payment attempt | PENDING_VERIFICATION, CONFIRMED, REJECTED | Pending attempts do not enter the money ledger |
| Refund request | REQUESTED, APPROVED, CONFIRMED, REJECTED | Only CONFIRMED creates money outflow; approval/reauthentication required |
| Manual message | PREPARED, OPENED_IN_WHATSAPP | Do not claim delivered/read |

Do not use a single PAID/DONE order status. UI badges can say “Ready for Collection · Unpaid” or “Collected · Outstanding Balance.” “Closed” is derived: ACTIVE lifecycle, goods handed over, charges settled, no open issues. It never replaces the ledger.

### 6.2 Important transitions

| Command | Preconditions | Atomic effect | Reject when |
| --- | --- | --- | --- |
| Confirm order | Valid input, active service, matching version | Number+lines+work items+charge+audit+outbox | Price/rule availability changed without reconfirmation |
| Advance work | Production permission, matching source stage | Stage event and new version | Invalid transition or blocking issue |
| Mark ready | All work ready, QC and packing complete | ready_at+package snapshot+event | Packages incomplete or blocking issue open |
| Record payment | Positive amount; sufficient balance or authorized overpayment path | Receipt+cash movement if cash+audit | Duplicate business intent or invalid amount |
| Handover | Complete ready packages; balance≤0 or credit approval | Handover+custody status+audit | Existing handover or version conflict |
| Cancel | Permission and approved settlement | Lifecycle+credit adjustment+issue/custody flags | Previous handover; use a complaint rather than retrospective cancellation |
| Confirm refund | Approval, valid funds source, sufficient refundable amount | Refund ledger+cash movement if cash+audit | Amount exceeds remaining net receipts or is duplicated |

### 6.3 Invariants that must be tested

1. Orders, outlets, customers, lines, bags, payments, and handovers have consistent tenant ownership.
2. Order numbers are unique within the outlet and never reused after cancellation.
3. Net charges cannot be negative. Receipt/refund event amounts are positive; net values come from aggregation.
4. Refunds/reversals cannot exceed amounts available to refund/correct from their source receipts.
5. Late events cannot change a confirmed payment back to pending.
6. Concurrent release requests create only one handover.
7. Payment is not a production prerequisite, but is the default collection prerequisite.
8. Ready does not mean handed over.
9. Cancellation preserves money history and responsibility for goods.
10. Rework creates no new revenue unless the customer approves a new paid order.
11. Older receipt versions and audit actors/timestamps cannot be overwritten by subsequent edits.
12. Critical changes succeed together with their audit records; audit failure rolls back the command.

## 7. Functional requirements and acceptance criteria

### 7.1 Business identity, services, and customers

| ID | Priority | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR01 | P0 | Owner registration and onboarding | Create tenant and first outlet; require timezone, outlet contact, IDR currency; allow setup to resume |
| FR02 | P0 | Staff invitations | Expire after 72 hours; explicit role/outlet; revocation disables sessions within 5 minutes |
| FR03 | P0 | Outlet switching | Active outlet always visible; separate caches; no membership returns 403 even with a modified URL |
| FR04 | P0 | Services and pricing | Weight/per-item units, minimums, increments, rates, SLA, workflow; changes create versions; archived services remain on old receipts |
| FR05 | P0 | Customers | Display name required, phone optional; normalize +62; shared numbers allowed with warnings, never automatic merging |
| FR06 | P0 | Communication consent | Record purpose, channel, time, source; honor opt-out; marketing is separate and excluded from P0 |
| FR07 | P0 | Search | Exact receipt number, name prefix, normalized phone within outlet permissions; pagination/debounce; empty input does not dump contacts |

### 7.2 Orders and physical laundry

| ID | Priority | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR08 | P0 | Drafts | Retain temporary form state, visibly unofficial; no sales posting; recovering a draft creates no duplicate order |
| FR09 | P0 | Multiple services | At least one line; each line has quantity/unit/service snapshot; reject zero/negative weight |
| FR10 | P0 | Confirmation | Server recalculation and idempotency; optional cash receipt saved with order; failures roll back fully |
| FR11 | P0 | Bag identity | At least one bag per work item; unique internal code; label includes order+line+bag count; reprints are identifiable |
| FR12 | P0 | Condition notes | Optional text/photos, no per-garment inventory claim; operators see relevant handling instructions |
| FR13 | P0 | Official revisions | Supervisor, reason, version check required; create debit/credit delta and revision number; provide the latest receipt version |
| FR14 | P0 | Receipts | Number, outlet, services, actual/billable quantities, prices, discounts, total, deposit, balance, deadline, version; reprint creates no order |
| FR15 | P0 | Deadlines | Automatic calendar-hour suggestion and override reason; correct aggregate deadline; retain original promise |

### 7.3 Production, issues, and handover

| ID | Priority | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR16 | P0 | Workboard | Sort by deadline; filter service/stage/overdue; authorized outlets only; show last update |
| FR17 | P0 | Stage updates | Valid workflow, matching version, actor audit; conflicting updates never silently overwrite each other |
| FR18 | P0 | QC/packing | All lines ready, QC passed; final packages and rack required before ready; reject another order's packages |
| FR19 | P0 | Complaints/holds | Category, severity, blocking flag, owner, resolution reason; blockers prevent appropriate ready/handover actions |
| FR20 | P0 | Rework | Before handover: authorized stage rollback with reason; after handover: new custody case; no duplicate sales |
| FR21 | P0 | Handover | All packages together; recipient/verification, balance check, single event; replay returns original result |
| FR22 | P0 | Collection on credit | Owner/authorized supervisor, reauthentication, amount limit, approval audit; balance remains outstanding |
| FR23 | P0 | Cancellation | Explicit settlement and custody status; no automatic refund; already handed-over orders cannot be cancelled |
| FR24 | P1 | Partial handover | Package-level separation and agreed balance allocation/policy; revise states and complete UAT before enabling |

### 7.4 Payments, cash, and reports

| ID | Priority | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR25 | P0 | Deposits/full payment | Multiple receipts per order; balance always derived from ledger; double-click creates one receipt |
| FR26 | P0 | Manual transfer/QRIS | Pending until authorized staff check bank/payment activity; screenshots are not confirmation; save references when available |
| FR27 | P0 | Refunds/reversals | Approval, reason, source receipt, amount, method; distinguish recording corrections from actual refunds; no hard-deletion |
| FR28 | P0 | Cash sessions | One active session per drawer; opening float, expected/actual closing cash, discrepancy; closing preserves earlier records |
| FR29 | P0 | Expenses | Category, amount, method, note, actor; cash affects session; corrections use reversals; evidence optional |
| FR30 | P0 | Source-based reports | Separate order value, receipts, refunds, receivables, expenses; drill-down sums equal summaries |
| FR31 | P0 | Exports | UTF-8 CSV with formula-injection protection; owner/supervisor permission; include interval/outlet/timezone |
| FR32 | P1 | Laundry gateway | Correct business merchant, verified/idempotent webhooks, reconciliation; keep laundry funds separate from SaaS payments |

### 7.5 Tracking, notifications, and SaaS administration

| ID | Priority | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR33 | P0 | Customer tracking | Random nonsequential token; noindex/no-store; minimal status, due time, outlet contact and bill summary; no customer contacts/internal photos |
| FR34 | P0 | Manual WhatsApp | Preview number/message; open prepared message, never claim delivered; copy fallback; communication permission satisfied |
| FR35 | P0 | Follow-up queue | Ready/uncollected and outstanding balances; manual click does not schedule automatic reminders |
| FR36 | P0 | Audit | Record price, balance, handover, admin access, exports, and role changes; users cannot edit audit records |
| FR37 | P0 | SaaS plans | Trial/active/grace/restricted; entitlement separate from laundry balance; existing orders can be completed while restricted |
| FR38 | P0 | Tenant export/exit | Owner can request own data; export links expire; subscription cancellation does not immediately delete data |
| FR39 | P0 | Support | Time-limited authorized access, ticket reason and audit; no default visibility into every tenant's transactions |
| FR40 | P1 | Official automated WhatsApp | Valid templates/consent; webhook states, retries/dedup, opt-out; no unofficial WhatsApp session automation |

## 8. Information architecture and UX specifications

### 8.1 Job-based navigation

| Area | Users | Priority content |
| --- | --- | --- |
| Cashier | Cashier/supervisor | Create Order, Find Order, Payment, Collection, Cash Session |
| Production | Operator | Queue, Stage, QC, Packages & Racks, Issues |
| Overview | Owner | Overdue, Ready but Uncollected, Receivables, Today's Cash |
| Records | Owner/supervisor | Customers, Services & Prices, Expenses |
| Reports | Owner/supervisor | Orders, money received, receivables, cash, audit |
| Settings | Owner | Outlets, Staff, Printers, Policies, Application Plan, Exports |
| Public tracking | Customer | Current status, completion promise, last update, outlet contact |

### 8.2 Main screen specifications

**Create Order:** sticky outlet context, customer lookup, favorite services, weight keypad, calculated price, deadline, bags, optional notes/payment. Confirmation summary remains visible before commit. Secondary action: Save Draft; primary: Confirm Order. Show billable weight when it differs from actual weight. Do not place SaaS upsells in the cashier flow.

**Order Detail:** number and separate status badges; summary, processing, payments, and history tabs. Primary action follows role/state. “Hand Over Laundry” cannot show success before server commit. Refund/cancel actions must not sit beside payment actions without confirmation.

**Workboard:** list on phones, optional board on larger screens. Earliest deadline first. Cards show bag IDs, service, quantity, brief notes. Color is not the only overdue indicator.

**QC and Packing:** concise identity, completeness, and condition checklist; package count and rack code; visible blockers. Scan internal IDs when camera support exists; manual code entry always remains available.

**Payment:** outstanding amount, method, received amount, cash change, and pending-transfer status. Reauthenticate for corrections/refunds according to role. Client fields cannot override server totals.

**Close Cash Session:** show each method; staff enter the physical count; system shows expected cash and discrepancy. Do not automatically classify a discrepancy as an expense. Supervisors mark it reviewed rather than erase it.

**Tracking:** no login, but a secret bearer link; general service labels, display number, due time and status. No customer phone, private condition/stain notes, staff audit, or photos. Only public outlet contact details. Show “Last updated…” and a failure banner when data cannot be loaded.

### 8.3 UI states and accessibility

- Include loading, empty, error, forbidden, stale, retrying, and offline/unconfirmed states.
- Toasts are not the only transaction confirmation; retain the committed receipt/order number on screen.
- Target touch areas of at least 44×44 CSS pixels, keyboard access, explicit input labels, and focus restoration after dialogs.
- Test mobile at 360 px, tablet at 768 px, desktop at 1280 px. No horizontal scrolling in the main cashier workflow.
- Consistent rupiah formatting; normalize decimal comma/dot weight input. Display the Indonesian-format example 2,75 kg.
- Indonesian UI at P0; English may follow. Use Title Case for short labels and natural sentences for help text.
- Missing printer/rack setup should lead to the relevant setting rather than a generic error.
- Dark mode is not a release blocker; contrast and efficient workflows take priority.

## 9. Financial records, order pricing, and calculation examples

### 9.1 Money source of truth

Use integer rupiah (BIGINT/safe monetary types) and integer grams. Binary floating point must not be the calculation source of truth. API serialization and maximum-value validation must be safe for the supported amount/quantity range.

Weight-based pricing:

`billable_grams = ceil(max(actual_grams, minimum_grams) / increment_grams) × increment_grams`

`line_gross = round_half_up(billable_grams × price_per_kg_idr / 1000)`

Per-item pricing: positive integer quantity × unit price. Store minimums, increments, and rounding rules with the price version. P0 supports order-level fixed-amount discounts within permission limits; percentages and tiered promotions are P1. Discounts cannot exceed the subtotal. Automatic tax is disabled by default; tax-invoice implementation requires current legal/business review, not a rate copied from a competitor's website.

### 9.2 Operational ledger

- `C = initial charges + debit adjustments − credit adjustments` (net charges, ≥0).
- `N = confirmed receipts − confirmed real refunds − correcting receipt reversals` (net customer money).
- `balance = C − N`.
- Positive balance: outstanding; zero: settled; negative: customer credit/money to return.
- Pending verification does not enter N. Requested refunds do not reduce N until confirmed.
- Real refunds affect current money movement. Reversals correct inaccurate records; for closed cash sessions, create a reviewable correction exception rather than silently changing the close.
- Migration opening entries carry flags excluding them from go-live-day cash; see Section 18.
- P0 supports one receipt per order; combined payment across orders is unavailable.
- For normal cash over-tender, use tendered/change so the receipt contains only the amount applied. A transfer actually exceeding the balance is recorded by a supervisor as credit_due, not discarded.

### 9.3 Main pricing fixture

| Input | Value |
| --- | --- |
| Actual weight | 2,350 grams |
| Minimum | 3,000 grams |
| Increment | 100 grams |
| Rate | IDR 8,000/kg |
| Billable weight | 3,000 grams |
| Subtotal | IDR 24,000 |
| Fixed discount | IDR 2,000 |
| Total C | IDR 22,000 |
| Cash deposit | IDR 10,000 |
| Balance | IDR 12,000 |
| Customer tenders IDR 20,000 to settle | Receipt IDR 12,000; change IDR 8,000 |

Second fixture: 3,210 grams, minimum 3,000, increment 100 → 3,300 billable grams → IDR 26,400 at IDR 8,000/kg. Preserve actual weight; do not overwrite it with 3,300.

### 9.4 Correction and refund scenarios

| Case | Calculation | Correct result |
| --- | --- | --- |
| Price 50,000; deposit 20,000 | C=50,000; N=20,000 | Balance=30,000 |
| Cancel before processing; waive bill | Credit 50,000 → C=0; N=20,000 | Credit_due 20,000, not settled |
| Confirm deposit refund | N=20,000−20,000=0 | Balance=0; goods still must be returned |
| Fully paid 50,000; compensation discount 10,000 | C=40,000; N=50,000 | Credit_due 10,000 until refunded |
| Refund 10,000 without reducing charges | C=50,000; N=40,000 | Balance=10,000; must not remain paid |
| Recorded transfer of 20,000 was incorrect | Reverse the linked receipt; N decreases by 20,000 | Outstanding amount increases; no real refund occurred |

All monetary amounts in this table are IDR.

### 9.5 Cash sessions

`expected_cash = opening_float + cash_receipts + authorized_cash_in − cash_refunds − cash_expenses − authorized_cash_out ± valid_current_session_corrections`

Do not subtract change again if receipts are already net. Transfers/QRIS do not increase physical cash. Example: opening IDR 100,000 + cash receipts 300,000 − expenses 40,000 − refunds 20,000 = expected 340,000. Actual 335,000 → discrepancy −5,000. Another 200,000 in transfers does not change expected cash.

Cashier closes; supervisor reviews discrepancies. Several staff may use one drawer, but each receipt retains its actor. A session can span staff changes only if the owner's SOP allows it. One drawer cannot have two active sessions. Cash refunded on a later date belongs to that day's active session rather than reopening the original one.

P0 reports are operational reports, not a balance sheet or accounting net profit. Order value, cash received, and profit are different measures.

## 10. Permissions and security

### 10.1 RBAC with outlet scope

| Action | Owner | Outlet supervisor | Outlet cashier | Production operator | SaaS administrator |
| --- | --- | --- | --- | --- | --- |
| Manage tenant/billing | Yes | No | No | No | Billing metadata appropriate to role |
| Manage services/prices | Yes | Explicit permission | No | No | No default access |
| Create orders | Yes | Yes | Yes | No | No |
| View customer contacts | Yes | Yes | Relevant outlet | No | No default access |
| Update production/QC | Yes | Yes | Additional permission | Yes | No |
| Receive cash | Yes | Yes | Yes | No | No |
| Verify transfers | Yes | Yes | Explicit permission | No | No |
| Discounts/revisions/refunds | Yes | Within limits/permissions | Request only | No | No |
| Handover | Yes | Yes | Yes | No | No |
| Release on credit | Yes | Permission and limit | No | No | No |
| Close cash session | Yes | Yes | Own drawer session | No | No |
| Reports/exports/audit | All outlets | Authorized outlets | Own session summary | No financial access | Temporary support access only |

Approval cannot rely on a frontend flag. The server checks permissions, outlet, limits, active session, and reauthentication where required. A sole owner may approve their own action, but audit records identify self-approval; do not claim perfect separation of duties.

### 10.2 Minimum threat model

| Threat | Control | Test |
| --- | --- | --- |
| IDOR/cross-tenant access | Authorized session tenant, composite FKs, query scopes, defense-in-depth RLS | Tenant A tries every endpoint/file belonging to Tenant B |
| Operator accesses financials | Role-specific DTOs and server permissions | Network inspection contains no prohibited balances/contacts |
| Tracking token guessed/leaked | ≥128-bit randomness, hashed storage, rotation, rate limits, expiry, minimal payload | Order-number enumeration cannot open tracking |
| XSS/SQL injection | Parameterized queries, escaping, schema validation | Malicious notes remain plain text |
| Malicious uploads | Actual-type allowlist, 5 MB/photo limit, sensitive metadata stripping, private storage | HTML disguised as JPG is rejected |
| CSRF/session theft | HttpOnly/Secure/SameSite cookies, appropriate CSRF controls, session expiry | Cross-origin writes rejected |
| Cashier fraud | Approval, audit, reversal/refund reports, no deletion | Cashier cannot directly lower the total |
| SaaS admin misuse | No default operational access; support TTL/reason/audit | Expired access immediately rejected |
| Export/log leaks | Short-lived signed downloads, PII redaction, audit, CSV safety | No customer phones/tokens in error logs |
| Login abuse | Rate limiting, progressive lockout, owner/admin MFA | Brute-force attempts cannot flood the endpoint |

### 10.3 Personal data and retention

Indonesia's Personal Data Protection Law covers processing, data-subject rights, and controller/processor duties. Its application to this business requires legal review before launch. A checkbox alone is not sufficient. [S4](https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022).

Initial design: minimize names/phones; no national IDs or biometrics. Provide access, correction, and deletion requests. Transaction identities may be anonymized where recordkeeping duties require retaining amounts. Transaction retention, processing grounds, controller/processor roles, and cross-border transfers must be agreed in policies/DPA before general availability.

Technical proposals requiring legal/operational approval: condition photos retained 90 days after completion unless disputed; tracking expires 30 days after handover/return, with a maximum 180 days without rotation; export downloads last 15 minutes; support access lasts 60 minutes; rolling backups retained 35 days. Legal holds require a reason, scope, and review date, not indefinite uncontrolled retention.

After deletion is approved, remove live objects within the internal 7-day SLA. Backups follow rotation; restores must reapply the deletion ledger. These are design targets, not quoted statutory deadlines. Review applicable electronic-system registration, incident response, and consumer terms before public launch.

## 11. Technical architecture and data flow

### 11.1 Architecture choice

Use a modular monolith: one backend application with clearly separated modules, **PostgreSQL hosted on Supabase**, **Supabase Auth**, private **Supabase Storage**, and asynchronous workers. Begin with **Supabase Free for development and demos**. The responsive website uses Next.js/TypeScript and Tailwind; verify framework versions and compatibility at kickoff. Do not prescribe untested React/Next versions.

| Component | Responsibility | Must not |
| --- | --- | --- |
| Cashier/owner/production web UI | Forms, display state, scanning/printing, safe retries | Be the final source of prices/balances |
| Auth and policy layer | Sessions, tenant memberships, roles/outlets/limits | Trust tenant_id in the body without validation |
| Order service | Snapshots, numbers, workflows, deadlines, pricing | Call external providers inside money commits |
| Money service | Charges, receipts, refunds, cash sessions | Hard-delete financial history |
| PostgreSQL | Integrity, locking, constraints, basic reporting | Be publicly accessed with a privileged role |
| Outbox and workers | P1 official notifications, exports, retries, housekeeping | Assume exactly-once delivery |
| Object storage | Private photos and short-lived exports | Expose customer data in public buckets |
| SaaS billing | Application entitlements | Mix with laundry transactions |
| Tracking read API | Minimal public token-based payload | Return the entire Order JSON |

Write the database outbox in the same transaction as its command so job intent survives a post-commit failure. Workers can initially use a database queue; Redis is not mandatory for the pilot. PostgreSQL supports transactions and row security, but isolation and permissions require configuration and testing. [S5](https://www.postgresql.org/docs/current/transaction-iso.html), [S6](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

### 11.2 Order intake data flow

1. Client sends input, expected price version, and client_request_id.
2. Server authenticates and checks outlet access and subscription policy.
3. Validate the schema and recalculate the quote.
4. In one transaction: lock relevant resources; save the idempotency record; allocate a number; create order, lines, bags, workflow, charges, optional cash receipt, cash movements, audit, and outbox.
5. Commit the database transaction.
6. Return resource IDs, number, version, snapshot, and receipt. UI shows official saved confirmation.
7. Printing/sharing happens separately; failure does not trigger a new order.

### 11.3 Domain modules and dependencies

Identity/tenant management is foundational. Orders use the catalog and generate work items. Money records reference orders. Fulfillment checks work, issues, and money. Reports read ledger sources; integrations consume the outbox. Reporting and notifications must not write balances directly.

Separate backend units through interfaces/domain functions rather than excessive network services. A simple deployment is easier to operate; workers can run separately so heavy exports do not slow cashiers.

### 11.4 Supabase database and service decisions

| Need | Choice | Implementation rule |
| --- | --- | --- |
| Orders, customers, ledger, cash, audit | Supabase PostgreSQL | Retain Section 12's relational schema, atomic transactions, price snapshots, and tenant constraints |
| Owner/staff login | Supabase Auth | Link auth_subject to the application user; verify roles/outlets from server-side memberships |
| Condition photos and exports | Supabase Storage private buckets | Store object keys/metadata, not base64 photos, in database tables |
| Calculations and business commands | Next.js backend | Interdependent pricing, receipts, refunds, handover, and audit belong in one database transaction |
| Data isolation | tenant_id, outlet access, RLS | Auth alone is insufficient; test read/write/file policies across tenants |
| Display updates | Scoped refresh/polling at P0 | Realtime is optional and never payment truth |

P0 access decision: the browser calls the backend for operational data. The backend verifies Supabase Auth sessions and uses a least-privileged server-side PostgreSQL connection for transactions. Multiple separate REST requests must not be treated as a single transaction. Use a connection pool compatible with the runtime and verified transaction-local tenant/user context. The application role must not bypass RLS; migration credentials are separate.

Revoke unnecessary direct browser grants to operational tables. For deliberately exposed tables, check both RLS and grants. RLS does not replace business-action or approval checks. Supabase service-role/secret keys remain server-only for limited administrative use; never bundle them in the frontend or use them routinely while assuming RLS always applies. [S15](https://supabase.com/docs/guides/database/postgres/row-level-security).

For Storage, validate tenant, parent entity, MIME type, and size before issuing short-lived uploads/downloads. Object names use IDs rather than customer names/phones. Buckets remain private. Photos do not directly consume table capacity, but metadata, indexes, history, and audit still consume database space.

### 11.5 Free-plan limits and upgrade decisions

Snapshot as of 10 September 2026; recheck before provisioning or purchasing. [S13](https://supabase.com/pricing).

| Component | Supabase Free |
| --- | --- |
| Database | 500 MB per project |
| File storage | 1 GB |
| Auth monthly active users | 50,000 |
| Egress | 5 GB; provider lists another 5 GB of cached egress separately |
| Active projects | Maximum 2 |
| Inactivity | Projects pause after one week of inactivity |
| Automatic backups and PITR | Not included |

Quotas do not establish a guaranteed number of laundries/orders. Monitor database, index, file, and egress usage; set internal warning targets at 70% and 85%. If projected growth will exhaust capacity within 30 days, review the plan before reaching its limits. Do not delete the ledger to save space.

Start with local development where practical and a cloud demo project containing synthetic data. Staging/production must remain isolated; two free projects are not a reason to mix tests with customer data. Workers, Next.js hosting, production email, and backups have separate costs. Supabase Free does not make the whole application free to operate.

Pro is advertised from $25/month with daily backups retained for seven days, but **daily backups are not PITR and do not provide 35-day retention**. Compute, add-ons, and additional usage may cost extra. Upgrading to Pro alone does not automatically meet Section 16's RPO/RTO targets. [S13](https://supabase.com/pricing), [S14](https://supabase.com/docs/guides/platform/backups).

Before becoming a laundry's primary transaction record, select and fund database/file backups that meet the targets, complete a restore drill, and document results. A pilot with different recovery targets requires an explicit PRD/pilot-agreement revision and risk acceptance from the outlet owner. Do not silently lower targets to keep the free plan. The v1.1 update did not change any recovery target.

## 12. Data model and integrity

### 12.1 Core entities

| Table/entity | Important fields | Relationships/constraints |
| --- | --- | --- |
| tenants | id, name, status | Ownership boundary |
| outlets | id, tenant_id, timezone, code, hours | Unique tenant+code |
| users | id, auth_subject, status | Global identity; no implicit default tenant |
| memberships | tenant_id, user_id, role, permissions | Unique tenant+user |
| outlet_access | tenant_id, user_id, outlet_id | Explicit access; consistent FKs |
| customers | id, tenant_id, name, normalized_phone nullable | Phone not universally unique |
| communication_consents | customer_id, purpose, channel, source, timestamp, revoked_at | Consent history |
| services/service_versions | outlet_id, name, unit, rate, min, increment, workflow, SLA | Immutable version referenced by orders |
| orders | tenant_id, outlet_id, customer_id, number, lifecycle, version, original/current due, accepted_at | Unique tenant+outlet+number |
| order_revisions | order_id, number, snapshot, reason, approved_by | Unique order+revision |
| order_lines | order_id, service_version_id, actual_qty, billable_qty, price_snapshot, due | Explicit units; qty>0 |
| work_items | line_id nullable for rework, order_id, workflow_snapshot, stage, version, cycle | Consistent parent scope |
| work_events | work_item_id, from/to, actor, at, reason | Application-level append-only |
| intake_bags | order_id, work_item_id, code, condition | Unique tenant+bag code |
| final_packages | order_id, code, rack, custody_state | Unique tenant+package code |
| package_contents | package_id, work_item_id | Same order/tenant only |
| issues/rework_cases | order_id, type, blocker, status, owner, resolution; rework custody fields | Link original order; do not overwrite handover |
| charge_entries | order_id, kind, amount_signed, revision_id, actor | Net charge≥0 enforced through transaction/lock |
| payment_attempts | order_id, method, amount, status, reference | No ledger effect until confirmed |
| receipts | order_id, amount, method, confirmed_at, verifier, source_attempt | Unique source attempt where present |
| refunds/reversals | receipt_id, amount, status, approval, reason, at | Cumulative caps via locked source receipt |
| cash_drawers/cash_sessions | outlet_id, opened_by, float, closed_at, actual, reviewed_by | Partial uniqueness: one active session/drawer |
| cash_movements | session_id, source_type/id, amount_signed | Unique source prevents duplicate posting |
| expenses | outlet_id, amount, method, category, actor, correction_ref | Immutable posting |
| handovers | order_id, receiver, verification, at, actor, credit_approval | One per order at P0 |
| handover_packages | handover_id, package_id | Each package handed over once |
| tracking_tokens | order_id, token_hash, expires_at, revoked_at | No raw tokens in logs |
| attachments | tenant_id, parent_type/id, object_key, mime, size, expires_at | Private; verified parent scope |
| notifications/outbox | event_id, channel, state, attempts, next_attempt_at | Unique event+channel+recipient target |
| idempotency_records | tenant_id, actor_id, command, key, payload_hash, result_ref | Unique scoped key; safe retry |
| audit_events | tenant_id, outlet_id, actor, action, entity, redacted before/after, request_id, at | Application-level append-only; restricted access |
| subscriptions/entitlements | tenant_id, plan, state, paid_until, limits | Separate from laundry orders |
| saas_invoices/receipts | tenant_id, billing_period, amount, verification | Not the laundry receipt tables |

### 12.2 Additional integrity rules

- All tenant-scoped operational tables carry tenant_id. Location-specific entities also carry outlet_id or a validated parent-derived outlet. Ledger posting records server recorded_at, occurred_at when different, actor, and source; cashiers cannot freely backdate postings.
- Customer records are tenant-scoped for owner deduplication, but cashiers see only customers created at, or with orders at, authorized outlets. Operators cannot access the customer directory. Cross-outlet lookup requires explicit permission. Duplicate warnings must also respect scope to prevent identity leaks.
- Use composite foreign keys (tenant_id, parent_id) to prevent cross-tenant links even when IDs are valid.
- Internal UUIDs are separate from display numbers, such as SB01-260909-000123. Numbering need not be gapless and is not a secret token.
- Stages/statuses use enums or reference tables, not unrestricted text. Add amount/quantity checks.
- Indexes: orders(tenant_id,outlet_id,accepted_at,id), work_items(tenant_id,outlet_id,stage,due_at), relevant customer phone/name indexes, receipts(order_id,confirmed_at), audit(entity_id,at), outbox(state,next_attempt_at).
- Use keyset pagination for long histories; run exports in workers. Partitioning is unnecessary until profiling justifies it.
- Cached counters/balances may improve performance but must reconcile to the ledger and be checked daily.
- Runtime DB roles must not be table owners/superusers bypassing RLS. Separate migration roles. Set tenant context transaction-locally on pooled connections and test context reset.
- Application-level append-only audit is not proof of DBA tamper resistance; restrict DB privileges and maintain backups.

## 13. API contracts, concurrency, and idempotency

### 13.1 Conceptual endpoints

| Method/path | Main input | Policy/output |
| --- | --- | --- |
| POST /v1/orders/quote | outlet, lines, discount | Server quote and price versions; not an order |
| POST /v1/orders | quote/input, request_id, optional cash payment | Auth/permission; 201 resource or replayed result |
| GET /v1/orders/{id} | ID | Scoped DTO with role-based fields |
| POST /v1/orders/{id}/revisions | expected_version, reason, approval, changes | Financial permission; ledger delta |
| POST /v1/work-items/{id}/transitions | expected_version, to_stage, reason | Valid workflow; audit |
| POST /v1/orders/{id}/ready | expected_version, packages, QC | All work ready; atomic update |
| POST /v1/orders/{id}/payment-attempts | method, amount, reference | Pending manual verification |
| POST /v1/payment-attempts/{id}/confirm | verifier input, idempotency_key | Single receipt; role check |
| POST /v1/orders/{id}/cash-receipts | amount, tendered, drawer_session | Lock balance; net receipt and change |
| POST /v1/receipts/{id}/refunds | amount, approval, method | Refund state; money out only after confirmation |
| POST /v1/orders/{id}/handover | expected_version, packages, receiver, approval? | Lock order/balance/packages; one handover |
| POST /v1/orders/{id}/cancel | settlement, reason, expected_version | Lifecycle/adjustment; unresolved custody where applicable |
| POST /v1/cash-sessions/{id}/close | expected_version, actual_cash, note | Immutable close; discrepancy |
| GET /t/{token} | Bearer token | Minimal read-only response; rate limited |
| POST /v1/exports | type, outlet_ids, interval | Authorized worker job; short-lived download |

Errors contain a stable code, Indonesian message, field_errors, and request_id; no SQL or secrets. Use 400 for validation, 401 for authentication, 403 for permissions, 404 according to anti-enumeration policy, 409 for version/idempotency conflicts, 422 for invalid state, 429 for rate limiting, and 503 for dependency outages.

### 13.2 Race conditions

- Use optimistic locking for edits/stages through expected_version. On conflict, refresh and reconfirm; never silently apply last-write-wins.
- For money/handover, lock the order and relevant source receipt/session rows in a consistent sequence. Recheck balance after obtaining locks.
- With simultaneous settlement, the second transaction sees the updated balance and rejects excess payment unless the supervisor explicitly uses the overpayment path.
- Do not hold DB transactions while printing, uploading, or calling WhatsApp/payment providers.
- Bound deadlock/serialization retries and retain the same request intent. Persist idempotency records for every financial command.

### 13.3 Idempotency

The client creates a request UUID when an action begins and reuses it until the result is known. The server stores tenant+actor+command+key scope and payload hash. Same key/same payload returns the original result; same key/different payload returns 409. Retain order/money operation keys with transaction metadata so late retries cannot create duplicate postings.

If a response is lost after commit, the UI checks status or retries using the same key. Never automatically generate a new key. Different keys can still represent separate clicks; business-state guards, unique source references, and disabled-submit UX help. Heuristic duplicate detection must warn rather than erase a legitimate repeat transaction.

### 13.4 Internal events

Events: OrderAccepted, OrderRevised, WorkStageChanged, OrderReady, PaymentConfirmed, RefundConfirmed, OrderHandedOver, OrderCancelled, CashSessionClosed. Envelope: event_id, tenant_id, aggregate_id, aggregate_version, occurred_at, type, minimal payload. Workers assume at-least-once, not exactly-once, delivery.

P1 ready notifications deduplicate by ready event/version. If an order returns to rework, recheck pending notifications before sending. Cancel an old job if the order is no longer ready. Delivered/read states only come from supported official webhooks, not internal timers.

## 14. Integrations, printing, and connection recovery

### 14.1 WhatsApp

P0 uses click-to-chat and prepared messages; staff select/confirm recipients. Providing a phone number does not automatically grant marketing consent. Record operational preferences and honor opt-outs. WhatsApp failures must not block intake, settlement, or handover.

P1 uses an official WhatsApp Business Platform integration, including business onboarding, communication consent, required templates, and current service-window rules. Policy distinguishes replies within the service window from initiated/template messages; verify again before implementation. [S7](https://business.whatsapp.com/policy), [S8](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in).

Account for message costs and vendor limits separately; do not promise unlimited automated WhatsApp in a low-cost plan. Do not operate bots through unofficial WhatsApp Web sessions.

### 14.2 Payments

P0: cash, and manual verification of transfers/QRIS already owned by the outlet. Static QR codes or screenshots do not establish automatic payment validity. Customer funds flow to the laundry, not the SaaS bank account.

P1: select one official provider and a merchant model supporting each business. Use sandbox testing, server credentials, signature/status verification, amount/currency/merchant/order matching, and reconciliation. Midtrans documentation emphasizes idempotency and verified notifications; follow the correct product API instead of mixing signature schemes. [S9](https://docs.midtrans.com/reference/best-practices-to-handle-notification), [S10](https://docs.midtrans.com/docs/https-notification-webhooks).

Webhook handling: authenticate → durably save event → acknowledge → process with deduplication/locking → reconcile uncertain ordering. Browser callbacks are not payment evidence. Late pending events cannot downgrade CONFIRMED. Pending provider refunds are not completed refunds. SaaS billing and laundry payments have separate merchant references and domain handlers.

### 14.3 Printers and labels

P0 provides 58 mm, 80 mm, and A4 print views through the operating system dialog; validate each size with actual drivers/printers. Use device-provided PDF saving where available, without promising universal PDF support on every phone.

Browser printing opens a dialog; it does not prove paper was printed. Web Bluetooth has limited compatibility and does not mean ordinary Bluetooth Classic printers can connect. [S11](https://developer.mozilla.org/en-US/docs/Web/API/Window/print), [S12](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API).

Publish a tested device list before selling support. If a pilot phone/printer is incompatible, use a tested cashier device/driver, digital receipt, or manual receipt. A bridge/native helper is P1, subject to demand and security testing. Operators select labels that survive their processing methods. Internal QR codes must not contain public tracking tokens.

### 14.4 Online-first operation and outages

- P0 cannot report offline money, handover, or production changes as successful. A cached PWA shell is not an offline POS.
- Preserve unsent form input temporarily; do not permanently retain customer data in a shared-device browser. If local drafts are used, apply a one-shift TTL, user/tenant scope, logout wiping, and an unofficial label.
- Show outage indicators and check request results before retrying.
- Emergency SOP: prenumbered paper receipts or a collision-free outlet+date+serial reference; record weight, amount, deposit, and staff identification. Emergency numbers are not server order numbers.
- Once online, authorized staff use recovery mode with a unique external_reference, original occurred_at, and server recorded_at. Establish whether cash was already included in an emergency session to avoid double counting. Supervisor reconciles receipt counts and physical cash.
- P1 offline support requires a local queue, device protection, idempotency, price versions, and conflict rules—not merely a service worker.

## 15. Reporting and analytics

### 15.1 Operational report definitions

| Metric | Definition | Interpretation limit |
| --- | --- | --- |
| Accepted orders | Count by accepted_at within interval | Separate cancellations and recovery imports |
| New order value | Initial charges for orders accepted in interval | Not cash received |
| Charge adjustments | Debits/credits posted in interval | Separate from initial order value |
| Money received | Confirmed receipts in interval | Separate methods and opening imports |
| Actual refunds | Confirmed real refunds in interval | Report recording reversals separately |
| Receivables as of cutoff | Sum max(C−N,0) at cutoff | Requires historical ledger cutoff, not only current balances |
| Customer credits | Sum max(N−C,0) | Cannot offset another customer's receivable |
| Ready but uncollected | Ready, in custody, not cancelled | Age measured from ready_at |
| On-time production | First order ready_at ≤ original order promise | Denominator: active orders becoming ready in the cohort; separately show overdue unfinished work |
| Rework rate | Orders with rework / processed orders in cohort | Observe reasons/time; do not automatically judge staff |
| Cash discrepancy | Actual minus expected per session | Not automatically theft |

Use [start,end) intervals after converting local day boundaries to UTC. Multi-timezone reports state their convention: each outlet's local date, not a shared UTC midnight. Cashiers cannot backdate financial posting history; recovery separates occurred_at and recorded_at.

### 15.2 Product analytics

Minimum events: onboarding_completed, first_order_confirmed, order_confirmed, work_updated, handover_confirmed, cash_session_closed, export_requested, subscription_renewed, error_code. Do not send customer names/phones/photos/tokens to third-party analytics.

Pilot north star: weekly active outlets completing order→production→handover with cash recorded, compared with actual outlet transactions. Track median/p90 input time, four-week usage, support minutes/outlet, cost/outlet, paid churn, and cancellation reasons. Frequent logins do not replace completed work.

## 16. Nonfunctional requirements, backups, and observability

All figures are design targets to test, not achieved SLAs.

| Area | Beta target | Verification |
| --- | --- | --- |
| Performance | Core read/write p95 ≤1.5 seconds server-side, excluding external providers | Load test with DB tracing |
| UX loading | Core workflow usable within 3 seconds on the defined pilot device/network | Physical Android and a documented network profile |
| Initial load | 100 outlets × 200 orders/day; 50 concurrent active cashier sessions | Seed ≥1 million orders; test 20 write commands/second with concurrent reports |
| Availability | Pilot target 99.5% monthly; not a contractual promise before operations prove it | Uptime probes and error budget |
| Backup | PITR target RPO≤15 minutes; recovery RTO≤4 hours | Isolated restore drill before beta and monthly |
| Integrity | No partial money transactions or retry duplicates | Failure injection and concurrency tests |
| Security | No unresolved critical/high findings before public launch | Auth/tenant/file review and scoped penetration testing |
| Accessibility | Keyboard, labels, contrast targeting WCAG AA on core screens | Automated/manual audit; no certification claim |
| Audit | Every critical command has audit/request_id | Automated assertions and sampling |

Backups cover the database and necessary photo/export objects. Document object schedules because database PITR does not restore deleted files automatically. Initial backup retention target is 35 days; choose supporting services. If the budget cannot meet RPO/RTO, change the pilot commitment before accepting business transactions, not after an incident.

**Supabase Free implication:** built-in Free features do not meet this backup gate. During development, schedule database exports to a separate location, retain necessary file copies, and test restores. Daily exports may lose changes since the previous export and do not substitute for a 15-minute RPO. Supabase database backups do not include Storage object contents; back up files separately. [S14](https://supabase.com/docs/guides/platform/backups).

Observability: end-to-end request IDs, latency/error rates per endpoint, DB pool saturation, lock waits, queue age, failed jobs, ledger/cache discrepancies, failed exports, backup age, and authentication anomalies. Urgent alerts for unauthorized exposure or inconsistent balances; warnings for slow queues. Redact logs and use pseudonymous tenant IDs, without WhatsApp content/customer phones.

Deployment: separate development/staging/production, secret management, backward-compatible expand/contract migrations, pilot tenant feature flags, predeployment builds/tests, and application rollback without destructive schema rollback. Ledger migrations need dry runs and backups. Never overwrite financial data merely to “fix a report.”

## 17. Testing strategy and UAT

### 17.1 Priority test cases

| ID | Scenario | Expected result |
| --- | --- | --- |
| T01 | 2.35 kg, minimum 3 kg, IDR 8,000/kg | Bill 3 kg; IDR 24,000 |
| T02 | 3.21 kg, 0.1 kg increment | Bill 3.3 kg; IDR 26,400 |
| T03 | Weight and per-item lines in one order | Exact summed total; separate workflows |
| T04 | Service price changes after order acceptance | Old receipt unchanged; new orders use new price |
| T05 | Double-click confirmation/timeout retry | One order, one initial charge, one receipt |
| T06 | Commit succeeds but response is lost | Key lookup returns the same order |
| T07 | IDR 10,000 deposit against IDR 22,000 | Partial; IDR 12,000 outstanding |
| T08 | Tender IDR 20,000 for IDR 12,000 balance | Receipt 12,000; change 8,000; cash +12,000 |
| T09 | Two cashiers settle concurrently | One succeeds; the other conflicts/refreshes; no hidden overpayment |
| T10 | Transfer screenshot uploaded | Still pending; N unchanged |
| T11 | Cancellation after deposit, followed by refund | Credit_due before refund; zero after; custody not automatically returned |
| T12 | Refund without a charge credit | Outstanding balance follows the formula |
| T13 | One of two lines is ready | Order not ready |
| T14 | QC fails | Reasoned rework, intact history, no extra charge |
| T15 | Package from another order selected | Reject before handover |
| T16 | Attempt collection while unpaid | Reject unless credit approved; receivable remains |
| T17 | Duplicate handover | One handover; no duplicate physical event |
| T18 | Rewash after collection | New custody case; original order history preserved |
| T19 | Cancel after handover | Reject; use complaint/refund policy |
| T20 | Reschedule after a missed deadline | Original promise preserved; past lateness not erased |
| T21 | Expected cash 340,000, actual 335,000 | Discrepancy −5,000; transfers do not increase cash |
| T22 | Reverse a receipt from yesterday's closed session | Correction exception and audit; closed snapshot not silently changed |
| T23 | Cash expense in an active session | Expected cash decreases exactly once |
| T24 | Manipulated tenant/outlet IDs | Safe 403/404; no data leakage |
| T25 | Production operator inspects API responses | No customer phones or financial data |
| T26 | Revoked/expired tracking token or guessed order number | Tracking unavailable |
| T27 | Printing fails | One order remains; reprint available |
| T28 | WhatsApp opened then cancelled | Opened state only, not delivered |
| T29 | Connection lost before commit | Unofficial/unsaved; draft/recovery available |
| T30 | Emergency receipt re-entered | Unique external reference prevents duplication; no double-counted cash |
| T31 | Customer name starts with =SUM(...) in CSV | Opening the CSV does not execute a formula |
| T32 | SaaS payment overdue | Existing orders can be completed; data/exports preserved |
| T33 | Staff access revoked | Sessions/endpoints rejected within target |
| T34 | Restore database and objects | Ledger, attachments, deletion ledger consistent |
| T35 | Partial collection attempted at P0 | Clear rejection; full order not marked collected |
| T36 | Family members share a phone number | Warning; no automatic customer merge/deletion |
| T37 | Transactions at local date boundaries | Receipts appear on the correct local date |
| T38 | Duplicate/out-of-order gateway events at P1 | One receipt; confirmed never downgraded to pending |
| T39 | Ready order enters rework before collection | current_ready_at cleared; first_ready_at preserved; handover blocked |
| T40 | Opened package replaced during repacking | Old code voided, new code active, linked history |
| T41 | Post-handover rework returned | Return belongs to rework case; original order handover remains singular |
| T42 | Cancel while goods remain in custody | Not returned until verified custody_return |
| T43 | Cashier searches another outlet's customers without permission | No contacts or identity-leaking warnings |

### 17.2 Testing layers

- Unit: pricing, rounding, state guards, permissions, balances, cash.
- Property-based: ledger-derived balances, monotonic rounding, refund caps, immutable price snapshots.
- Integration: atomic transactions, tenant FKs, RLS, payment approvals, outbox.
- E2E: order through handover, cancellation/refund, cash close, tracking, subscription restrictions.
- Concurrency/fault: post-commit timeout, deadlock, worker restart, storage failure, cancelled printing.
- Hardware: actual printer/driver/browser/OS combinations; manual fallback for camera scanning.
- Security: tenant bypass, uploads, token enumeration, CSRF, privilege escalation, exports.
- Human UAT: owners, cashiers, and operators from at least two businesses perform controlled real-world workflows.

### 17.3 Feature definition of done

Requirements/acceptance criteria map to tests; normal/error UX approved; permissions and tenant isolation pass; audit/log redaction correct; any migrations tested; SOP updated; no known critical issue; feature flag and rollback available.

### 17.4 QA backlog traceability

| Requirements | Minimum scenarios | Additional checks before sign-off |
| --- | --- | --- |
| FR01–FR03 | T24, T33, T37 | Failed signup, expired invitation, outlet switching/cache |
| FR04–FR07 | T01–T04, T36, T43 | Service archival, invalid phone, opt-out, paginated search |
| FR08–FR15 | T01–T06, T20, T27, T29 | Draft reload, invalid image, authorized revision, stale price quote |
| FR16–FR20 | T13–T14, T18, T39–T41 | Iron-only workflow, new blocker, production access |
| FR21–FR24 | T15–T17, T19, T35, T42 | Lost receipt, representative collection, expired approval; FR24 tested at P1 |
| FR25–FR29 | T07–T12, T21–T23 | Refund over cap, duplicate reversal source, concurrent close |
| FR30–FR32 | T21–T23, T31, T37–T38 | Summary/detail reconciliation, historical cutoff, migration exclusions |
| FR33–FR36 | T24–T28, T39 | Token rotation, noindex/no-store, audit modification rejection |
| FR37–FR40 | T32–T34, T38 | Support TTL, expired export access, manual billing audit, P1 WhatsApp opt-out |

This is a coverage plan. No application tests have been executed because the current deliverable is the PRD document.

## 18. Migration, onboarding, and SOPs

### 18.1 Outlet onboarding

1. Confirm scope: no requirement for partial collection, workshops, or fully offline transactions in P0.
2. Set outlet, timezone, contact, opening hours, staff, permissions.
3. Configure the main 3–10 services, minimums, rounding, SLAs, workflows.
4. Verify price fixtures with the owner and obtain price approval before go-live.
5. Test printer/labels on actual packages and establish numbered racks.
6. Simulate deposits, refunds, credit release, cash closing.
7. Set a migration cutoff and inventory active orders/balances.
8. Train staff, provide emergency receipts/support contacts, and sign off readiness.

### 18.2 P0 migration

Import catalogs/customers using a limited template, mapping preview, duplicate validation, and per-row results. Provide sample data without real PII. Do not automatically merge customers sharing a number.

Existing active orders use authorized opening-migration mode: unique old number/external reference, lines/work stages, packages/racks, initial charges, money received before cutoff, and remaining balance. Set source=opening so these entries do not increase today's cash receipts or new order value. Outstanding amounts still appear in as-of reports after cutoff. Set opening float from physical cash, not by summing all historical deposits again.

Each batch has an ID, record count, control totals for charges/receipts/balances, and owner sign-off. Roll back only batches not yet used by downstream work. After production/payment changes, use controlled corrections. Full prior-year history is P1.

### 18.3 Concise daily SOP

- Opening: check connection/printer, open drawer and enter float, review overdue work/blocking issues.
- Intake: weigh → confirm price/deadline → commit → label bags → issue receipt.
- Production: match labels before processing, update stages, record issues; never scan one order for several customers.
- Ready: QC → pack → count packages → assign rack → mark ready → prepare manual message if permitted.
- Collection: verify recipient → match packages → check balance → record payment if needed → hand over.
- Closing: reconcile physical cash, verified transfers, emergency receipts, and issues; close the session; supervisor reviews discrepancies.

### 18.4 Support and incidents

Cross-tenant exposure or corrupted balances are Sev1: disable the affected feature, preserve evidence, notify the responsible person, and restore from verified sources. Cashier outage is Sev2: use emergency receipts and communicate status. A single incompatible printer is Sev3: use digital receipts/an approved device. Set support response targets according to actual staffing; do not sell 24/7 support a solo founder cannot provide.

## 19. SaaS monetization and unit economics

### 19.1 Plan hypotheses

- Pilot: one outlet, P0 core features, written duration and support scope.
- Test IDR 79,000–149,000/outlet/month; not a validated market price.
- Optional paid setup/migration where real labor is required, estimated and approved in advance.
- Official WhatsApp, extra storage, and hardware integration incur separate costs; do not promise unlimited usage without evidence.
- No percentage fee on laundry transactions initially. Publish fair-use limits; never abruptly stop order entry during busy hours.

### 19.2 SaaS billing is separate from laundry payments

The pilot may use invoices and audited manual SaaS transfer verification by a billing administrator. Example trial: 14 days; grace period: 7 days. After grace, block new orders but allow completion, payments/refunds on existing orders, reports, and exports. Restrictions do not erase data; explain exit/retention procedures. P1 automated billing must never treat laundry customer receipts as SaaS subscription payment evidence.

### 19.3 Economic illustration, not a forecast

Example: IDR 99,000/outlet/month minus 15,000 allocated infrastructure/storage/backups, 4,000 payment costs, and 25,000 support = 55,000 contribution before acquisition, fixed costs, tax, and founder salary. If CAC is 150,000, simple payback is approximately 2.73 months, only if customers remain and the cost assumptions hold.

At 100 outlets, gross revenue is IDR 9.9 million/month and illustrative contribution is 5.5 million before other costs. Twenty support minutes/outlet/month becomes roughly 33 hours/month for 100 outlets, excluding onboarding. UX and onboarding therefore affect viability as much as server cost. Measure churn before estimating LTV; do not assume customers stay forever.

## 20. Roadmap, dependencies, and release gates

### 20.1 Delivery phases

Rough estimate: **12–16 weeks for the shared backend and W0 website**, with one experienced full-stack developer working focused hours and design/QA support. Part-time work takes longer. This excludes M0 mobile. Pilot findings may change estimates; this is not a launch promise.

| Phase | Estimate | Deliverable/gate |
| --- | --- | --- |
| Discovery/prototype | 1–2 weeks | Observation, baseline, pilot scope, verified pricing/labels/devices |
| Foundation/cashier | 3 weeks | Tenant, RBAC, catalog, pricing, snapshots, receipts, tests |
| Production/packages | 2 weeks | Workflows, QC, racks, issues, handover guards |
| Money/cash | 2–3 weeks | Receipts/verification, adjustments/refunds, cash, reconciled reports |
| Tracking/billing/operations | 1–2 weeks | Manual WhatsApp, tokens, exports, entitlements, support |
| Hardening/pilot | 3–4 weeks | Security/concurrency/hardware/restore, UAT, usage, renewals |

Money primitives may be implemented earlier as order dependencies even if complete cash UI follows later. Do not launch money acceptance before testing ledger/rollback behavior.

Android M0 is estimated at an additional 6–10 weeks after API contracts stabilize, including UI, authentication, app lifecycle, scanning, sharing, and UAT. iOS adds approximately 2–4 weeks for adjustments/testing if native/hardware issues do not arise. Store review time and custom printer work are not guaranteed to fit those estimates. Revise after device spikes; a shared codebase does not eliminate extra work.

### 20.2 Beta release gate

- T01–T37 and T39–T43 pass for P0, including traceability supplements; T38 is required before P1 gateway launch.
- No known critical/high authorization, incorrect-balance, duplicate-transaction, or data-loss defects.
- Pilot owner verifies minimums/increments/prices and labeling SOP.
- Pilot hardware and fallback pass testing.
- Exports, audit, restore drill, session revocation work.
- Pilot terms, offline/partial-collection limits, support, retention, and billing are explained.
- Complete at least one full simulated business day with reconciled closing cash and one outage drill.

### 20.3 Market expansion gate

After 30 days, review transaction adoption, paid renewals, support costs, lateness versus baseline, resolved cash discrepancies, and complaints. If entry is slow or staff return to notebooks, improve workflows before adding AI/loyalty. If most need workshops/partial collection, reassess the segment or prioritize P1 rather than force a smaller scope.

## 21. Risks, open decisions, and sources

### 21.1 Risk register

| Risk | Mitigation owner | Mitigation | Residual risk |
| --- | --- | --- | --- |
| Insufficient paid demand | Founder | Paid pilot and renewal, not interest surveys | Business may remain unviable |
| More mature competitors | Product | Narrow workflow/segment; authorized comparative testing | Differentiation can be copied |
| Label/SOP noncompliance | Laundry owner | Training, QC, traceability, audit | Software cannot guarantee safe goods |
| Connection failures | Engineering/outlet | Online guards, emergency receipts, recovery | Re-entry effort remains |
| Money discrepancies | Engineering/supervisor | Ledger, locks, approvals, reconciliation | Physical fraud outside the app remains possible |
| Printer incompatibility | Engineering/sales | Compatibility matrix and fallback | Not every printer is supported |
| Growing support costs | Founder | Clear scope, onboarding, observability | Prices may need to increase |
| Data exposure | Security/owner | Scopes, private storage, audit, legal review | Risk does not become zero |
| Integration changes | Engineering | Adapters and current documentation checks | Vendor dependency remains |

### 21.2 Decisions to confirm before full implementation

1. Pilot outlets, actual workflows/volume, and who will pay.
2. Minimums/rounding, service types, and completion promises.
3. Whether partial collection, workshops, or offline operation are essential; if so, revise P0.
4. Printer/phone/driver combinations and process-resistant labels.
5. Discount, refund, credit-release permissions and one-person/two-person approval rules.
6. Compensation, condition records, and handling of uncollected goods.
7. Database/auth/storage are selected: Supabase PostgreSQL/Auth/Storage. Region, backend/worker hosting, email, production plan, and budget-compatible backup/retention still need selection.
8. Legal details: privacy policy, service agreement, data processing roles, recordkeeping/tax requirements, applicable electronic-system registration.
9. SaaS price, support hours, fair use, exit process.
10. Final stack versions after compatibility checks; official WhatsApp/payment integrations are not prerequisites for P0.

### 21.3 Primary sources and evidence limits

Sources initially accessed 9 September 2026, with later verifications indicated below. Product pages establish advertised features/categories, not vendor outcome claims. Domain decisions, money models, performance targets, scope, and test prices are this PRD's design proposals, not industry-standard quotations.

- **S1:** [Smartlink — Features](https://smartlink.id/fitur). Laundry operations category reference.
- **S2:** [Dicatetin — Product](https://dicatetin.com/id). Advertised tracking/notifications/multi-user features.
- **S3:** [Smartlink — Pricing](https://smartlink.id/biaya). Commercial-offering reference, not a prescribed new price.
- **S4:** [JDIH BPK — Law 27 of 2022 on Personal Data Protection](https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022). Basis for data-processing review, not a final compliance opinion.
- **S5:** [PostgreSQL — Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html). Database concurrency mechanisms.
- **S6:** [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html). Additional access-control layer.
- **S7:** [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy). Business-channel usage boundaries.
- **S8:** [Meta — Getting Opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in). Communication consent.
- **S9:** [Midtrans — Best Practices to Handle Notification](https://docs.midtrans.com/reference/best-practices-to-handle-notification). Idempotency and notification-source verification.
- **S10:** [Midtrans — HTTP(S) Notifications/Webhooks](https://docs.midtrans.com/docs/https-notification-webhooks). Server-based status updates.
- **S11:** [MDN — Window.print](https://developer.mozilla.org/en-US/docs/Web/API/Window/print). Browser print dialog.
- **S12:** [MDN — Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API). Browser/device support limitations.
- **S13:** [Supabase — Pricing](https://supabase.com/pricing). Free quotas, pausing, and plan features; verified 10 September 2026.
- **S14:** [Supabase — Database Backups](https://supabase.com/docs/guides/platform/backups). Backup/restore and file coverage limits; verified 10 September 2026.
- **S15:** [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security). RLS and grants; verified 10 September 2026.

### 21.4 Conclusion

P0 prioritizes the integrity of goods, money, and daily records. This PRD supplies implementable design decisions and test criteria, but suitability for individual laundries requires observation and UAT. Next, verify pricing rules, physical workflows, and hardware at pilot outlets, then turn requirements into design/engineering backlog items. No application has been built or tested while preparing this document.

## 22. Website PRD — Next.js

### 22.1 Purpose, users, and framework

The website is the complete administration and operations center: owners manage businesses/reports, cashiers work on computers/tablets, and customers open tracking in a browser. Responsive phone layouts are included, but a responsive website/PWA is not a native Android/iOS application.

| Website component | Choice |
| --- | --- |
| Framework | Next.js App Router |
| Language | TypeScript; HTML/CSS through React and Tailwind CSS |
| Styling | Tailwind CSS for web; centralized design tokens |
| Backend endpoints | Next.js Route Handlers, Node.js runtime for PostgreSQL connections |
| Login | Supabase Auth through a server-verified web session flow |
| Database and files | Supabase PostgreSQL and private Storage |

Route Handlers expose HTTP endpoints for the shared backend. Server Actions may support website interactions, but cannot be the sole contract required by mobile. [S16](https://nextjs.org/docs/app/getting-started/route-handlers).

### 22.2 W0 website pages

| Area | Pages | Related requirements |
| --- | --- | --- |
| Public | Landing, application plans, help, privacy/terms | FR37–FR39 |
| Account | Login, password reset, invitations, business onboarding | FR01–FR03 |
| Owner | Outlet overview, overdue work, receivables, cash | FR30 |
| Cashier | New order, order list/detail, payment, collection | FR08–FR15, FR21–FR27 |
| Production | Queue, stages, QC, packing/racks, issues/rework | FR16–FR20 |
| Finance | Open/close cash, expenses, verification, refunds, approvals | FR25–FR29 |
| Administration | Customers, services/prices, staff, outlets, policies | FR01–FR07 |
| Reports | Operations, drill-down, exports, audit | FR30–FR31, FR36 |
| Settings | Browser printing, access, subscription, exports/exit | FR37–FR39 |
| Customer | Secret tracking link, status summary, outlet contact | FR33–FR35 |

### 22.3 Website requirements

| ID | Priority | Requirement and acceptance criteria |
| --- | --- | --- |
| W01 | W0 | Layouts at 360/768/1280 px; no horizontal scrolling in the cashier flow; paginate long tables |
| W02 | W0 | Session cookies and implementation-appropriate CSRF protection; token refresh/login never exposes another tenant's data |
| W03 | W0 | Shared endpoints produce the same prices/balances as mobile; do not rely on frontend calculations |
| W04 | W0 | Test 58/80 mm and A4 print views on actual device combinations; cancelling print does not cancel an order |
| W05 | W0 | CSV exports require permission; private, expiring files with audit records |
| W06 | W0 | Login-free tracking exposes only the public DTO; customer names/transactions are not indexed |
| W07 | W0 | Browser back/reload/multiple tabs do not duplicate transactions; request keys and version checks still apply |
| W08 | W0 | Separate SaaS admin and laundry owner access; temporary authorized support access |

### 22.4 Website boundaries and gate

W0 covers all P0 domain requirements in Section 7. Full offline transactions, automated WhatsApp, partial handover, and gateways retain their existing priorities. There is no promise that a browser prints to every Bluetooth printer.

Release gate: W01–W08, P0 domain tests, restore drill, and hardware tests pass; a complete simulated business day produces correct ledger/cash results. Hosting the website does not require moving the database away from Supabase.

## 23. Mobile Apps PRD — React Native + Expo

### 23.1 Purpose, users, and framework

Installed apps serve owners, cashiers, and operators, not customers at M0. Android and iOS share a React Native project with platform adjustments. Android is released first for the pilot; iOS remains a subsequent product target.

| Mobile component | Choice |
| --- | --- |
| Framework | React Native + Expo |
| Language | TypeScript |
| Navigation | Expo Router, compatible with the selected Expo SDK |
| UI | Native components and React Native StyleSheet with shared design tokens |
| Login | Supabase Auth with a secure mobile session adapter |
| Business API | HTTPS JSON requests to the shared Next.js backend |
| Builds | Expo development builds; local builds or EAS as needed |
| Token storage | Tested SecureStore/keychain-keystore adapter |

Website DOM/Tailwind components do not automatically work in React Native. Colors, spacing, and design intent can share tokens; UI components are platform-specific. Expo development builds support native libraries/configurations beyond Expo Go and should be used from the printer spike onward. [S17](https://docs.expo.dev/develop/development-builds/introduction/).

### 23.2 M0 mobile screens

Role-based navigation: Home, Orders, Production, Account. Show scan/create-order actions only to authorized roles. Owners see summaries, cashiers see transaction queues, operators see work lists.

| Area | M0 scope | Advanced administration |
| --- | --- | --- |
| Login/outlet | Login, reset flow, outlet selection, logout | Tenant onboarding and staff invitations on web |
| Orders | Find customer, minimal customer creation, create/view order | Catalog/pricing management on web |
| Payments | Cash deposits/settlement, pending transfers, authorized verification | Complex approvals/refunds/revisions on web |
| Production | Scan/type code, stages, issues, QC, packages/racks | Workflow policies on web |
| Collection | Package/balance checks, recipient, full handover | Credit approved on web, followed by mobile refresh |
| Cash | Open/close drawer session, permitted expense entry | Discrepancy review and detailed reports on web |
| Owner | Per-outlet receipts, receivables, overdue summary | Exports and business configuration on web |
| Communication | Share receipt/link and manually open WhatsApp | Automated messages remain P1 |
| Printer | Sharing/digital receipts as baseline | Direct Bluetooth subject to compatibility spike |

Links to web administration use HTTPS and a separate web login session when needed; never place access tokens in URLs. Do not display unavailable mobile features as if they can be completed in the app.

### 23.3 Mobile requirements

| ID | Priority | Requirement and acceptance criteria |
| --- | --- | --- |
| MB01 | M0 | Login/refresh/logout remain correct across background/foreground transitions; backend rejects revoked membership |
| MB02 | M0 | Changing users/tenants/outlets clears unauthorized caches; old data does not flash on the new screen |
| MB03 | M0 | Order forms use appropriate keyboards and show actual/billable weight and the server quote before submission |
| MB04 | M0 | Persist minimal idempotent request-recovery intent; reopening after app termination checks the result without duplicate posting |
| MB05 | M0 | Internal QR scanning parses supported codes only; denied camera permission still allows manual entry |
| MB06 | M0 | Stage/QC/handover updates check server versions; conflicts with website edits require refresh/reconfirmation |
| MB07 | M0 | Camera/uploads use necessary permissions only, size limits, sensitive metadata removal; failed photos do not erase orders |
| MB08 | M0 | Cancelling share sheet/WhatsApp does not mark a message sent; preview recipient/message |
| MB09 | M0 | Disconnection shows unconfirmed state; no false-success receipt/handover |
| MB10 | M0 | Screen readers, safe areas, keyboard avoidance, and touch targets tested on actual devices |
| MB11 | Conditional | Direct Bluetooth printing enabled only for tested models/OSs; disconnect/retry creates no new order or receipt |
| MB12 | P1 | Optional push, clear permission, no sensitive contact/balance payload; tapping checks authentication/permissions before opening a resource |

### 23.4 Session and device-data security

The backend verifies mobile bearer tokens and current memberships rather than trusting app-supplied roles. Web cookies and mobile bearer tokens are two authentication paths to the same policy/domain layer. Allowlist Auth callbacks/deep links; browser origin/CORS is not a substitute for mobile authentication.

Use a secure-storage adapter compatible with Supabase session size/format; handle storage failures through an explicit re-login flow. Do not store refresh tokens in plain AsyncStorage. SecureStore is sensitive key-value storage, not an offline transaction database or backup. [S18](https://docs.expo.dev/versions/latest/sdk/securestore/).

App bundles contain public configuration only. Never bundle service-role keys, DB credentials, payment secrets, or WhatsApp secrets. Logout clears relevant sessions/caches/temporary photos without deleting server data. Offline customer-directory access is outside M0. Recovery records contain only minimal request identifiers and are cleared after resolution under the device policy.

### 23.5 Builds, distribution, and mobile gate

- Use Expo development builds rather than relying on Expo Go for all native capabilities.
- Separate development, staging, and production builds and API configurations.
- Android: test physical cashier devices, camera, back button, permissions, app restart, slow networks, and targeted printers.
- iOS: test physical devices, safe areas, backgrounding, login/deep links, and permissions; a successful Android build does not establish iOS readiness.
- Prepare developer accounts, signing, listings, privacy policies, and store processes before public release. Build/store account costs are not included in Supabase Free. Review in-app subscription sales rules before adding native checkout.
- M0 displays access/plan status; subscription sales/management occur on the website with the distribution flow checked against store policies before submission.
- Do not choose a printer library until the model/protocol/SDK spike is complete. If direct printing is essential to a pilot, MB11 blocks that pilot's release; otherwise explain sharing/digital receipts as the fallback.
- Mobile release gate: MB01–MB10, MB11 where promised, smoke/domain tests for available functions, and Section 24 cross-platform tests pass. Store review timing cannot be guaranteed by the team.

## 24. Shared system, code structure, and hosting

### 24.1 One transaction system

Website and mobile use the same versioned `/v1` API. Supabase Auth recognizes the same accounts. Tenant/outlet/roles and balances are not duplicated into separate systems. The backend is authoritative for prices, approvals, money, and custody. Mobile clients do not write directly to ledger tables through the client SDK.

P0/W0/M0 refresh data after mutations, on foregrounding, and through light polling on active screens. Target cross-device freshness is ≤15 seconds online under the defined test conditions. Payment/handover commands always check current server state even when displayed data is stale. Realtime may be added without changing invariants.

### 24.2 Suggested code structure

Use a pnpm workspace monorepo; sharing every UI component is unnecessary.

| Conceptual location | Contents | Consumers |
| --- | --- | --- |
| apps/web | Next.js pages/UI and HTTP route handlers | Browser and mobile endpoints |
| apps/mobile | React Native/Expo screens and native adapters | Android/iOS |
| packages/contracts | Request/response schemas, enums, types | Web, mobile, backend |
| packages/api-client | HTTP client, error mapping, request IDs | Web/mobile with different auth adapters |
| packages/design-tokens | Colors, spacing, typography intent | Web/native styling |
| packages/server-domain | Pricing, ledger, workflows, policies | Backend/workers only |
| packages/database | SQL migrations and server queries | Backend/workers only |

Never import database packages/server secrets into mobile or browser bundles. Shared validation improves UX consistency, but the backend always revalidates. Preserve compatibility with supported older mobile versions during transitions. Use additive API changes, feature capabilities, and a minimum-app-version policy rather than breaking installed apps on each website deployment.

### 24.3 Hosting and VPS

**A VPS is not mandatory.** Start with managed website/API hosting, Supabase database/auth/storage, and managed workers/queues for asynchronous processing. Mobile apps run on users' devices and still need connectivity for server transactions.

| Component | Hosting plan | Cost/operations note |
| --- | --- | --- |
| Next.js website/API | Vercel as an initial candidate, on a plan permitting commercial use | Hobby is not for commercial SaaS [S19] |
| Database/Auth/Storage | Supabase; Free for development/demos | Section 16's production backup gate still applies |
| Workers/queues | Managed scheduled/queue workers; provider selected during sizing | Must support durable jobs, retries, server secrets, and required execution time |
| Mobile builds | Local toolchain or Expo EAS | Build services are not the application backend |
| Mobile distribution | Android/iOS via appropriate pilot/store channels | Verify signing and store requirements |

Do not run permanent workers inside time-limited request handlers. Retain the PostgreSQL outbox and process bounded batches using managed workers with locking/deduplication. If exports exceed execution limits, move them to a suitable managed worker; a VPS is not automatically required.

A VPS becomes an option when control requirements or cost comparisons justify it. It requires OS patching, security, monitoring, and backup management, and does not eliminate database/file costs. Vercel/worker choices are deployment plans, not authorization to purchase or provision infrastructure through this PRD update.

### 24.4 Cross-platform acceptance criteria

| ID | Scenario | Correct result |
| --- | --- | --- |
| XP01 | Create order on Android, open it on the website | Same number, lines, prices, and balance after refresh |
| XP02 | Website and mobile pay the same balance concurrently | One valid posting; other request conflicts according to rules, without duplication |
| XP03 | Mobile operator changes a stage while web edits occur | Version conflict detected; history preserved |
| XP04 | App terminates after server commit | Request lookup recovers the original result after reopening |
| XP05 | Owner revokes access through the website | Mobile rejected within PRD revocation target; cache cleared |
| XP06 | API updates while older mobile versions remain active | Supported-version contract tests pass; no silent breaking change |
| XP07 | Settle payment on web, hand over on mobile | Backend checks current balance; one handover |
| XP08 | Token/deep link targets another tenant's order | Reject based on permissions, not possession of the URL |

### 24.5 Additional v1.2 references

- **S16:** [Next.js — Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers). Backend HTTP endpoints.
- **S17:** [Expo — Development Builds](https://docs.expo.dev/develop/development-builds/introduction/). Native libraries and build options.
- **S18:** [Expo — SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/). Sensitive local storage.
- **S19:** [Vercel — Hobby Plan](https://vercel.com/docs/plans/hobby). Noncommercial use restrictions; see Section 24.3.

Additional references were checked on 10 September 2026. All website/mobile acceptance criteria are implementation specifications awaiting testing. No website or mobile app was built or published through this PRD revision.
