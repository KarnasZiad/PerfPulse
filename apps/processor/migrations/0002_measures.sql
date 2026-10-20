-- Raw measures in hypertables, and continuous aggregates of log-histogram buckets (ADR 0004).

create extension if not exists timescaledb;

create table web_vitals (
  time timestamptz not null,
  project_id uuid not null,
  metric text not null check (metric in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  value double precision not null check (value >= 0),
  -- floor(ln(value in ms, or CLS x 1000) / ln(1.05)): see @perfpulse/protocol.
  bucket smallint not null check (bucket >= 0),
  rating text not null check (rating in ('good', 'needs-improvement', 'poor')),
  page text not null,
  device text not null check (device in ('mobile', 'tablet', 'desktop')),
  browser text not null,
  os text not null,
  country char(2),
  session_id text not null,
  release text
);

select create_hypertable('web_vitals', by_range('time', interval '1 day'));
create index web_vitals_project_metric_time_idx on web_vitals (project_id, metric, time desc);

create table page_views (
  time timestamptz not null,
  project_id uuid not null,
  page text not null,
  navigation_type text not null,
  device text not null check (device in ('mobile', 'tablet', 'desktop')),
  browser text not null,
  os text not null,
  country char(2),
  session_id text not null,
  release text
);

select create_hypertable('page_views', by_range('time', interval '1 day'));
create index page_views_project_time_idx on page_views (project_id, time desc);

-- Dashboard queries always filter on the project, then on the metric.
alter table web_vitals set (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'project_id, metric',
  timescaledb.compress_orderby = 'time desc'
);
alter table page_views set (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'project_id',
  timescaledb.compress_orderby = 'time desc'
);
select add_compression_policy('web_vitals', interval '7 days');
select add_compression_policy('page_views', interval '7 days');
select add_retention_policy('web_vitals', interval '30 days');
select add_retention_policy('page_views', interval '30 days');

-- Counts per bucket: percentiles of any period or dimension are computed from these sums.
create materialized view vitals_hourly
with (timescaledb.continuous, timescaledb.materialized_only = false) as
select
  time_bucket(interval '1 hour', time) as hour,
  project_id,
  metric,
  device,
  bucket,
  count(*) as samples,
  count(*) filter (where rating = 'good') as good,
  count(*) filter (where rating = 'needs-improvement') as needs_improvement,
  count(*) filter (where rating = 'poor') as poor
from web_vitals
group by hour, project_id, metric, device, bucket
with no data;

create materialized view vitals_daily_pages
with (timescaledb.continuous, timescaledb.materialized_only = false) as
select
  time_bucket(interval '1 day', time) as day,
  project_id,
  metric,
  page,
  bucket,
  count(*) as samples
from web_vitals
group by day, project_id, metric, page, bucket
with no data;

create materialized view page_views_daily
with (timescaledb.continuous, timescaledb.materialized_only = false) as
select
  time_bucket(interval '1 day', time) as day,
  project_id,
  page,
  device,
  count(*) as views
from page_views
group by day, project_id, page, device
with no data;

select add_continuous_aggregate_policy('vitals_hourly',
  start_offset => interval '3 days', end_offset => interval '1 hour', schedule_interval => interval '15 minutes');
select add_continuous_aggregate_policy('vitals_daily_pages',
  start_offset => interval '3 days', end_offset => interval '1 hour', schedule_interval => interval '1 hour');
select add_continuous_aggregate_policy('page_views_daily',
  start_offset => interval '3 days', end_offset => interval '1 hour', schedule_interval => interval '1 hour');

select add_retention_policy('vitals_hourly', interval '400 days');
select add_retention_policy('vitals_daily_pages', interval '400 days');
select add_retention_policy('page_views_daily', interval '400 days');
