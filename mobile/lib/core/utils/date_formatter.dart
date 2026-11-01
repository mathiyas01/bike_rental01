import 'package:intl/intl.dart';

class DateFormatter {
  static String formatDate(dynamic date, {String locale = 'en'}) {
    if (date == null) return '-';
    DateTime? dt;
    if (date is DateTime) {
      dt = date;
    } else if (date is String) {
      if (date.trim().isEmpty) return '-';
      try {
        dt = DateTime.parse(date);
      } catch (_) {
        return date;
      }
    } else {
      return date.toString();
    }

    if (locale == 'ro') {
      return DateFormat('dd.MM.yyyy', 'ro').format(dt);
    }
    return DateFormat('yyyy-MM-dd').format(dt);
  }

  static String formatDateTime(dynamic dateTime) {
    if (dateTime == null) return '-';
    DateTime? dt;
    if (dateTime is DateTime) {
      dt = dateTime;
    } else if (dateTime is String) {
      if (dateTime.trim().isEmpty) return '-';
      try {
        dt = DateTime.parse(dateTime);
      } catch (_) {
        return dateTime;
      }
    } else {
      return dateTime.toString();
    }
    return DateFormat('yyyy-MM-dd HH:mm').format(dt);
  }

  static int daysDifference(DateTime targetDate) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final target = DateTime(targetDate.year, targetDate.month, targetDate.day);
    return target.difference(today).inDays;
  }

  static bool isExpired(DateTime? date) {
    if (date == null) return false;
    return daysDifference(date) < 0;
  }

  static bool isDueSoon(DateTime? date, {int thresholdDays = 30}) {
    if (date == null) return false;
    final days = daysDifference(date);
    return days >= 0 && days <= thresholdDays;
  }
}
