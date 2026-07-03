/**
 * OpenTelemetry initialisation for SMOG server.
 *
 * Call `initOtel()` once, as early as possible in the process (before other
 * services start logging), to register a LoggerProvider backed by an OTLP
 * HTTP exporter. After that, every `createLogger()` call automatically
 * forwards logs to the configured backend in addition to the console.
 *
 * If `OTEL_EXPORTER_OTLP_ENDPOINT` is not set, this is a complete no-op —
 * only console output is produced and no packages are initialised.
 *
 * ## Environment variables
 *
 * | Variable                          | Description                                                          |
 * |-----------------------------------|----------------------------------------------------------------------|
 * | `OTEL_SERVICE_NAME`               | Service name shown in Grafana (default: `"smog-server"`)             |
 * | `OTEL_EXPORTER_OTLP_ENDPOINT`     | Base OTLP HTTP endpoint, e.g. `https://…/otlp` (enables export)     |
 * | `OTEL_EXPORTER_OTLP_HEADERS`      | Comma-separated `key=value` pairs, e.g. `Authorization=Basic <b64>` |
 *
 * The SDK appends `/v1/logs` to `OTEL_EXPORTER_OTLP_ENDPOINT` automatically.
 * To set the logs path explicitly use `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`.
 *
 * ## Grafana Cloud example
 * ```
 * OTEL_SERVICE_NAME=smog-server
 * OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-eu-west-0.grafana.net/otlp
 * OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64(instanceId:apiKey)>
 * ```
 *
 * ## Self-hosted Grafana Alloy example
 * ```
 * OTEL_SERVICE_NAME=smog-server
 * OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318
 * ```
 */

import { logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";

let _initialized = false;

export function initOtel(): void {
  if (_initialized) {
    return;
  }
  _initialized = true;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    // No endpoint configured — silently skip. Console-only logging remains active.
    return;
  }

  const serviceName = process.env.OTEL_SERVICE_NAME ?? "smog-server";

  const resource = resourceFromAttributes({ "service.name": serviceName });

  // OTLPLogExporter reads OTEL_EXPORTER_OTLP_ENDPOINT / OTEL_EXPORTER_OTLP_HEADERS
  // from the environment automatically when no options are passed.
  const exporter = new OTLPLogExporter();

  const provider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor(exporter)],
  });

  logs.setGlobalLoggerProvider(provider);
}
