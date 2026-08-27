# API

Versioned REST begins at `/api/v1`. Success is `{success:true,data,meta?}` and errors are `{success:false,error:{code,message,requestId}}`. `/health` checks process liveness and `/ready` checks PostgreSQL. Route modules for auth, organizations, websites, audits, reports, monitoring, billing, API keys, webhooks, agency, and admin are the next implementation slice.
