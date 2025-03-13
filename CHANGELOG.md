# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- None

### Changed
- None

### Fixed
- Fixed refresh stats button functionality to properly update tweet engagement metrics

## [1.0.0] - 2025-03-11

### Added
- Fixed Telegram Filter Command Buttons
- Enhanced Logging System with Quiet Mode
- Implemented Automatic Batching for KOL_MONITORING
- Added MongoDB Fallback Mode
- Implemented Phase 4: Enhanced Monitoring Process
- Removed Legacy Competitor Monitoring Topics
- Eliminated Account Duplication

### Changed
- Updated license to proprietary

### Fixed
- Fixed Rettiwt Search Parameter Structure
- Fixed Telegram Filter Command Buttons

## [0.9.0] - 2025-03-01

### Added
- Completed MongoDB Migration
- Enhanced Phase 4: Streamlined Monitoring Process
- Implemented Phase 3: Processing Flow Simplification

### Changed
- Created Architecture Simplification ADR
- Reduced Log Verbosity

### Fixed
- Fixed Duplicate Age Validation Logging

## [0.8.0] - 2025-02-15

### Added
- Created Logging and Filter Improvements ADR
- Added KOL Monitoring Configuration

### Fixed
- Fixed KOL Monitoring Filter Configuration
- Fixed Competitor Channel Routing
- Fixed Competitor Tweet Consolidation

## [0.7.0] - 2025-02-01

### Added
- Competitor Tweet Consolidation
- MongoDB Integration for Sentiment Analysis

### Fixed
- Topic Routing Fix

## [0.6.0] - 2025-01-15

### Added
- Enhanced Tweet Display Formatting

### Changed
- Improved Tweet Sorting and Duplicate Handling
- Improved Rate Limiting Configuration

## [0.5.0] - 2025-01-01

### Added
- Initial project structure
- Twitter monitoring service with batched account processing
- Telegram notification service with message queue
- Circuit breaker and rate limiting patterns
- Metrics collection and monitoring dashboard
- Dependency injection using Inversify
- Configuration management
- Logging system
