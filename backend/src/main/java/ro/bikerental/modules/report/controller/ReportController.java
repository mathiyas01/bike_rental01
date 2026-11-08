package ro.bikerental.modules.report.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import ro.bikerental.modules.report.dto.BikeRoiDto;
import ro.bikerental.modules.report.dto.DashboardKpiDto;
import ro.bikerental.modules.report.dto.DateRangeReportDto;
import ro.bikerental.modules.report.dto.FleetUtilizationDto;
import ro.bikerental.modules.report.service.ReportService;

import java.util.UUID;
import java.time.LocalDate;

@RestController
@RequestMapping("/api/v1/reports")
@Tag(name = "Reports & Analytics", description = "Dashboard business metrics, fleet utilization, and motorbike ROI analysis")
public class ReportController {

    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    @GetMapping("/dashboard")
    @Operation(summary = "Get high-level dashboard business KPIs and monthly revenues")
    public ResponseEntity<DashboardKpiDto> getDashboardKpis() {
        return ResponseEntity.ok(reportService.getDashboardKpis());
    }

    @GetMapping("/fleet-utilization")
    @Operation(summary = "Get current fleet utilization metrics and breakdown")
    public ResponseEntity<FleetUtilizationDto> getFleetUtilization() {
        return ResponseEntity.ok(reportService.getFleetUtilization());
    }

    @GetMapping("/date-range")
    @Operation(summary = "Get rental, revenue, service, and stock summary for a date range")
    public ResponseEntity<DateRangeReportDto> getDateRangeReport(
            @RequestParam LocalDate fromDate,
            @RequestParam LocalDate toDate) {
        return ResponseEntity.ok(reportService.getDateRangeReport(fromDate, toDate));
    }

    @GetMapping("/bike-roi/{bikeId}")
    @Operation(summary = "Get individual motorbike financial return on investment (revenue vs maintenance)")
    public ResponseEntity<BikeRoiDto> getBikeRoi(@PathVariable UUID bikeId) {
        return ResponseEntity.ok(reportService.getBikeRoi(bikeId));
    }
}
