export class MetricsRegistry {
  private requests = 0;
  private readonly statusCounts = new Map<number, number>();

  public recordRequest(statusCode: number): void {
    this.requests += 1;
    this.statusCounts.set(statusCode, (this.statusCounts.get(statusCode) ?? 0) + 1);
  }

  public renderPrometheus(): string {
    const lines = [
      "# HELP shortfactory_http_requests_total Total HTTP requests handled by the API.",
      "# TYPE shortfactory_http_requests_total counter",
      `shortfactory_http_requests_total ${this.requests}`,
      "# HELP shortfactory_http_responses_total HTTP responses by status code.",
      "# TYPE shortfactory_http_responses_total counter"
    ];
    for (const [statusCode, count] of [...this.statusCounts.entries()].sort(([left], [right]) => left - right)) lines.push(`shortfactory_http_responses_total{status_code="${statusCode}"} ${count}`);
    return `${lines.join("\n")}\n`;
  }
}
