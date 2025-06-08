// src/components/features/sleepTracker/SleepTracker.js
import { requestPermission, onMessageListener } from '../../../firebase/firebaseConfig';
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { saveAs } from "file-saver";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  SmartwatchSetup,
  SmartSleepAnalysis,
  useSmartwatch,
} from "./SmartwatchIntegration";
import "./SleepTracker.css";
import "./SmartwatchIntegration.css";

function SleepTracker() {
  // State Management
  const [sleepLogs, setSleepLogs] = useState([]);
  const [newSleepLog, setNewSleepLog] = useState({
    date: new Date().toISOString().split("T")[0],
    bedtime: "22:00",
    wakeup: "06:00",
    duration: "",
    quality: "good",
    mood: "happy",
    notes: "",
    heartRate: "",
    steps: "",
  });
  const [sleepGoal, setSleepGoal] = useState(
    () => parseFloat(localStorage.getItem("sleepGoal")) || 8
  );
  const [reminderTime, setReminderTime] = useState(
    () => localStorage.getItem("reminderTime") || "21:00"
  );
  const [reminderEnabled, setReminderEnabled] = useState(
    () => localStorage.getItem("reminderEnabled") === "true"
  );
  const [filterQuality, setFilterQuality] = useState("all");
  const [sortOption, setSortOption] = useState("date-desc");
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("darkMode") === "true" || true
  );
  const [deviceData, setDeviceData] = useState(null);
  const [showSaved, setShowSaved] = useState(false);
  const [activeTipCategory, setActiveTipCategory] = useState("all");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [expandedTip, setExpandedTip] = useState(null);
  const [expandedDevice, setExpandedDevice] = useState(null);
  const [editingLog, setEditingLog] = useState(null);
  const [notification, setNotification] = useState({
    show: false,
    message: "",
    type: "",
  });

  // New Features
  const [sleepPhases, setSleepPhases] = useState({
    deep: 0,
    light: 0,
    rem: 0,
    awake: 0,
  });
  const [weeklyGoalProgress, setWeeklyGoalProgress] = useState(0);
  const [sleepTrends, setSleepTrends] = useState({
    improving: false,
    consistency: 0,
    weeklyAvg: 0,
  });
  const [healthConnections, setHealthConnections] = useState({
    steps: false,
    heartRate: false,
    stress: false,
  });

  // Smartwatch Integration States
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [smartwatchData, setSmartwatchData] = useState(null);
  const [showSmartwatch, setShowSmartwatch] = useState(false);

  // Main navigation tabs
  const navigationTabs = [
    { id: "dashboard", name: "Dashboard", icon: "📊" },
    { id: "logs", name: "Sleep Logs", icon: "📝" },
    { id: "analytics", name: "Analytics", icon: "📈" },
    { id: "tips", name: "Sleep Tips", icon: "💡" },
    { id: "devices", name: "Devices", icon: "⌚" },
    { id: "smartwatch", name: "Smartwatch", icon: "📱" },
  ];

  // Sleep Tips Categories
  const tipCategories = [
    { id: "all", name: "All Tips", icon: "🔍" },
    { id: "critical", name: "Critical Tips", icon: "⚠️" },
    { id: "routine", name: "Sleep Routine", icon: "🔄" },
    { id: "environment", name: "Sleep Environment", icon: "🏠" },
    { id: "habits", name: "Daily Habits", icon: "📊" },
    { id: "recovery", name: "Recovery", icon: "🔋" },
  ];

  const sleepTips = [
    {
      id: 1,
      title: "Consistent Sleep Schedule",
      description: "Regulate your body clock with a steady bedtime routine.",
      details: {
        recommended:
          "Set a fixed bedtime and wake-up time, even on weekends, aiming for ±30 minutes consistency.",
        avoid: "Irregular sleep patterns that disrupt your circadian rhythm.",
        tip: "Use the app reminders to maintain your schedule across the week.",
      },
      critical: true,
      category: "routine",
      icon: "🌙",
    },
    {
      id: 2,
      title: "Optimal Sleep Environment",
      description: "Create a sleep sanctuary with ideal conditions.",
      details: {
        recommended:
          "Dark room with blackout curtains, temperature between 60-67°F (15-19°C), minimal noise.",
        avoid:
          "Bright screens, uncomfortable temperature, disruptive sounds or lights.",
        tip: "Consider a white noise machine, humidifier, or blackout curtains for better sleep quality.",
      },
      critical: true,
      category: "environment",
      icon: "🏠",
    },
    {
      id: 3,
      title: "Digital Sunset Protocol",
      description: "Reduce blue light exposure before bedtime.",
      details: {
        recommended:
          "Turn off all screens 1-2 hours before bed, use night mode or blue light filters if necessary.",
        avoid:
          "Social media, news, work emails, or stimulating content before sleep.",
        tip: "Try reading a physical book, gentle stretching, or meditation instead of screen time.",
      },
      critical: true,
      category: "habits",
      icon: "📱",
    },
    {
      id: 4,
      title: "Mindful Evening Nutrition",
      description:
        "Optimize your evening meals and beverages for better sleep.",
      details: {
        recommended:
          "Light, easy-to-digest meals 2-3 hours before bedtime, calming teas like chamomile.",
        avoid:
          "Caffeine after noon, alcohol before bed, heavy or spicy meals, excessive liquids close to bedtime.",
        tip: "A small protein-rich snack like yogurt or a banana can help stabilize blood sugar through the night.",
      },
      critical: false,
      category: "habits",
      icon: "🍽️",
    },
    {
      id: 5,
      title: "Strategic Exercise Timing",
      description: "Optimize workout schedules for sleep quality.",
      details: {
        recommended:
          "Regular exercise, ideally earlier in the day, gentle stretching or yoga in the evening.",
        avoid:
          "Intense workouts within 2-3 hours of bedtime, which can raise core temperature and alertness.",
        tip: "Track your sleep quality after different exercise timing to find your optimal schedule.",
      },
      critical: false,
      category: "habits",
      icon: "🏃",
    },
    {
      id: 6,
      title: "Stress Management Protocol",
      description: "Implement evening stress relief practices.",
      details: {
        recommended:
          "Deep breathing exercises, progressive muscle relaxation, journaling, gratitude practice.",
        avoid:
          "Work tasks, stressful conversations, planning, or problem-solving right before bed.",
        tip: 'Create a "worry list" to write down concerns and set them aside until morning.',
      },
      critical: true,
      category: "routine",
      icon: "😌",
    },
    {
      id: 7,
      title: "Circadian Rhythm Alignment",
      description: "Sync your sleep with natural light-dark cycles.",
      details: {
        recommended:
          "Morning sunlight exposure, dimming lights in the evening, complete darkness for sleep.",
        avoid:
          "Bright lights at night, irregular sleep-wake times, daytime darkness.",
        tip: "Use sunrise alarm clocks to wake naturally with light.",
      },
      critical: false,
      category: "environment",
      icon: "☀️",
    },
    {
      id: 8,
      title: "Recovery Nap Strategy",
      description: "Optimize daytime naps without disrupting night sleep.",
      details: {
        recommended:
          "Short power naps (20-30 minutes) early afternoon, not after 3PM.",
        avoid:
          "Long naps, late afternoon or evening napping, using naps to compensate for poor night sleep.",
        tip: "Set a timer and nap in a slightly upright position to avoid falling into deep sleep.",
      },
      critical: false,
      category: "recovery",
      icon: "😴",
    },
    {
      id: 9,
      title: "Sleep Technology Optimization",
      description: "Leverage sleep tracking for personalized insights.",
      details: {
        recommended:
          "Calibrate devices properly, establish baseline measurements, focus on trends rather than daily fluctuations.",
        avoid:
          "Obsessing over sleep data, using intrusive devices that disrupt sleep, comparing to others.",
        tip: "Use the sleep phase data to optimize your alarm timing for waking during lighter sleep stages.",
      },
      critical: false,
      category: "environment",
      icon: "⌚",
    },
    {
      id: 10,
      title: "Sleep Debt Recovery",
      description: "Strategic approach to catching up on lost sleep.",
      details: {
        recommended:
          "Gradual recovery by adding 15-30 minutes extra sleep per night, consistent wake times.",
        avoid:
          "Weekend oversleeping, irregular catch-up patterns, daytime hibernation.",
        tip: "Track your sleep debt in the app and create a systematic recovery plan over 1-2 weeks.",
      },
      critical: false,
      category: "recovery",
      icon: "🔋",
    },
  ];

  const recommendedDevices = [
    {
      id: 1,
      name: "Oura Ring Gen3",
      description: "Premium sleep tracking with minimal disturbance.",
      details:
        "The Oura Ring provides comprehensive sleep stage analysis, heart rate variability, and temperature monitoring in a discreet form factor that doesn't disturb sleep.",
      features: [
        "Sleep Stages",
        "HRV Tracking",
        "Body Temperature",
        "Readiness Score",
        "Activity Tracking",
      ],
      price: "$299.00",
      link: "https://ouraring.com",
      image: "/images/oura_ring.jpg",
      rating: 4.8,
      category: "wearable",
    },
    {
      id: 2,
      name: "Withings Sleep Analyzer",
      description: "Under-mattress sleep tracking with sleep apnea detection.",
      details:
        "This non-wearable device fits under your mattress and tracks sleep cycles, heart rate, snoring, and even detects sleep apnea episodes with medical-grade accuracy.",
      features: [
        "Sleep Cycle Analysis",
        "Heart Rate Monitoring",
        "Snoring Detection",
        "Sleep Apnea Detection",
        "Smart Home Integration",
      ],
      price: "$129.95",
      link: "https://www.withings.com",
      image: "/images/withings_sleep.jpg",
      rating: 4.6,
      category: "non-wearable",
    },
    {
      id: 3,
      name: "Dreem 2 Headband",
      description: "Advanced EEG-based sleep monitoring and improvement.",
      details:
        "The Dreem 2 uses EEG sensors to monitor brain activity during sleep, providing the most accurate sleep staging available in consumer technology, plus sound stimulation to enhance deep sleep.",
      features: [
        "EEG Monitoring",
        "Brain Activity Tracking",
        "Deep Sleep Stimulation",
        "Detailed Sleep Architecture",
        "Personalized Coaching",
      ],
      price: "$499.00",
      link: "https://dreem.com",
      image: "/images/dreem_headband.jpg",
      rating: 4.4,
      category: "wearable",
    },
    {
      id: 4,
      name: "Eight Sleep Pod Pro",
      description: "Temperature-regulating smart mattress cover.",
      details:
        "This advanced mattress cover provides dynamic temperature regulation for each side of the bed, tracks sleep phases, and integrates with your smart home for the optimal sleep environment.",
      features: [
        "Dual-Zone Temperature Control",
        "Sleep Tracking",
        "Smart Alarm",
        "Heart Rate Monitoring",
        "HRV Analysis",
      ],
      price: "$1,695.00",
      link: "https://www.eightsleep.com",
      image: "/images/eight_sleep.jpg",
      rating: 4.7,
      category: "non-wearable",
    },
    {
      id: 5,
      name: "Philips SmartSleep Deep Sleep Headband",
      description: "Enhances slow wave sleep for better recovery.",
      details:
        "Designed for those who don't get enough sleep, this headband detects when you're in deep sleep and delivers customized audio tones to enhance the quality of this restorative sleep phase.",
      features: [
        "Slow Wave Sleep Enhancement",
        "Sleep Tracking",
        "Smart Alarm",
        "Insights & Coaching",
        "Battery Life: 4+ Nights",
      ],
      price: "$399.95",
      link: "https://www.philips.com",
      image: "/images/philips_smartsleep.jpg",
      rating: 4.2,
      category: "wearable",
    },
    {
      id: 6,
      name: "SleepScore Max",
      description: "Non-contact sleep improvement system.",
      details:
        "This bedside device uses echolocation technology to monitor your breathing and movement without any wearables, providing detailed sleep analysis and personalized advice.",
      features: [
        "Contactless Monitoring",
        "Light & Temperature Analysis",
        "Comprehensive Sleep Scores",
        "Science-Based Advice",
        "Room Environment Optimization",
      ],
      price: "$149.99",
      link: "https://www.sleepscore.com",
      image: "/images/sleepscore_max.jpg",
      rating: 4.0,
      category: "non-wearable",
    },
  ];
  // Local Storage Persistence
  useEffect(() => {
    const savedLogs = localStorage.getItem("sleepLogs");
    if (savedLogs) {
      setSleepLogs(JSON.parse(savedLogs));
    } else {
      const sampleLogs = [
        {
          id: 1,
          date: "2025-04-10",
          bedtime: "22:30",
          wakeup: "06:30",
          duration: 8.0,
          quality: "excellent",
          mood: "happy",
          notes: "Slept deeply, felt refreshed!",
          heartRate: 62,
          steps: 9500,
          sleepPhases: { deep: 110, light: 240, rem: 90, awake: 10 },
        },
        {
          id: 2,
          date: "2025-04-11",
          bedtime: "23:00",
          wakeup: "05:00",
          duration: 6.0,
          quality: "poor",
          mood: "tired",
          notes: "Woke up several times.",
          heartRate: 68,
          steps: 6200,
          sleepPhases: { deep: 70, light: 210, rem: 60, awake: 20 },
        },
        {
          id: 3,
          date: "2025-04-12",
          bedtime: "22:00",
          wakeup: "07:00",
          duration: 9.0,
          quality: "good",
          mood: "calm",
          notes: "Felt well-rested.",
          heartRate: 64,
          steps: 8300,
          sleepPhases: { deep: 120, light: 270, rem: 110, awake: 5 },
        },
      ];
      setSleepLogs(sampleLogs);
    }

    // Initialize sleep phases
    calculateSleepPhases();

    // Initialize health connections
    setHealthConnections({
      steps: localStorage.getItem("healthConnectionSteps") === "true" || false,
      heartRate:
        localStorage.getItem("healthConnectionHeartRate") === "true" || false,
      stress:
        localStorage.getItem("healthConnectionStress") === "true" || false,
    });
  }, []);

  useEffect(() => {
    localStorage.setItem("sleepLogs", JSON.stringify(sleepLogs));
    localStorage.setItem("sleepGoal", sleepGoal);
    localStorage.setItem("reminderTime", reminderTime);
    localStorage.setItem("reminderEnabled", reminderEnabled);
    localStorage.setItem("darkMode", darkMode);

    // Save health connections
    localStorage.setItem("healthConnectionSteps", healthConnections.steps);
    localStorage.setItem(
      "healthConnectionHeartRate",
      healthConnections.heartRate
    );
    localStorage.setItem("healthConnectionStress", healthConnections.stress);

    onMessageListener()
      .then((payload) => {
        setNotification({
          show: true,
          message: payload.notification.body,
          type: "success",
        });
        setTimeout(
          () => setNotification({ show: false, message: "", type: "" }),
          3000
        );
      })
      .catch((err) =>
        console.error("Failed to receive foreground message:", err)
      );

    // Calculate sleep trends
    calculateSleepTrends();

    // Calculate sleep phases
    calculateSleepPhases();

    // Calculate weekly goal progress
     calculateWeeklyProgress();
   }, [
     sleepLogs,
     sleepGoal,
     reminderTime,
     reminderEnabled,
     darkMode,
     healthConnections,
   ]);

  // Calculate duration when bedtime/wakeup changes
  useEffect(() => {
    if (newSleepLog.bedtime && newSleepLog.wakeup) {
      const calculatedDuration = calculateDuration(
        newSleepLog.bedtime,
        newSleepLog.wakeup
      );
      setNewSleepLog((prev) => ({
        ...prev,
        duration: calculatedDuration,
      }));
    }
  }, [newSleepLog.bedtime, newSleepLog.wakeup]);

  // Calculate duration based on bedtime and wakeup
  const calculateDuration = useCallback((bedtime, wakeup) => {
    if (!bedtime || !wakeup) return "";

    const [bedHours, bedMinutes] = bedtime.split(":").map(Number);
    const [wakeHours, wakeMinutes] = wakeup.split(":").map(Number);

    let durationHours = wakeHours - bedHours;
    let durationMinutes = wakeMinutes - bedMinutes;

    if (durationHours < 0) durationHours += 24;
    if (durationMinutes < 0) {
      durationMinutes += 60;
      durationHours -= 1;
    }

    const totalMinutes = durationHours * 60 + durationMinutes;
    return (totalMinutes / 60).toFixed(1);
  }, []);

  // Calculate weekly progress toward sleep goals
  const calculateWeeklyProgress = () => {
    const today = new Date();
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(today.getDate() - 7);

    const thisWeekLogs = sleepLogs.filter((log) => {
      const logDate = new Date(log.date);
      return logDate >= oneWeekAgo && logDate <= today;
    });

    if (thisWeekLogs.length === 0) {
      setWeeklyGoalProgress(0);
      return;
    }

    const daysMetGoal = thisWeekLogs.filter(
      (log) => parseFloat(log.duration) >= sleepGoal
    ).length;
    const progress = Math.round((daysMetGoal / thisWeekLogs.length) * 100);
    setWeeklyGoalProgress(progress);
  };

  // Calculate sleep trends based on previous logs
  const calculateSleepTrends = () => {
    if (sleepLogs.length < 7) {
      setSleepTrends({ improving: false, consistency: 0, weeklyAvg: 0 });
      return;
    }

    // Sort logs by date
    const sortedLogs = [...sleepLogs].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    // Get last 7 days and previous 7 days logs
    const last7Days = sortedLogs.slice(-7);
    const previous7Days = sortedLogs.slice(-14, -7);

    // Calculate averages
    const last7Avg =
      last7Days.reduce((sum, log) => sum + parseFloat(log.duration), 0) /
      last7Days.length;
    const previous7Avg =
      previous7Days.length > 0
        ? previous7Days.reduce(
            (sum, log) => sum + parseFloat(log.duration),
            0
          ) / previous7Days.length
        : 0;

    // Calculate bedtime consistency
    const bedtimes = last7Days.map((log) => {
      const [hours, minutes] = log.bedtime.split(":").map(Number);
      return hours * 60 + minutes; // convert to minutes
    });

    const avgBedtime =
      bedtimes.reduce((sum, time) => sum + time, 0) / bedtimes.length;
    const deviations = bedtimes.map((time) => Math.abs(time - avgBedtime));
    const avgDeviation =
      deviations.reduce((sum, dev) => sum + dev, 0) / deviations.length;

    // Calculate consistency score (100 is perfect consistency)
    const consistencyScore = Math.max(0, 100 - avgDeviation * 2);

    setSleepTrends({
      improving: last7Avg > previous7Avg,
      consistency: Math.round(consistencyScore),
      weeklyAvg: last7Avg.toFixed(1),
    });
  };

  // Calculate average sleep phases
  const calculateSleepPhases = () => {
    if (sleepLogs.length === 0 || !sleepLogs.some((log) => log.sleepPhases)) {
      setSleepPhases({ deep: 0, light: 0, rem: 0, awake: 0 });
      return;
    }

    const logsWithPhases = sleepLogs.filter((log) => log.sleepPhases);

    if (logsWithPhases.length === 0) {
      setSleepPhases({ deep: 0, light: 0, rem: 0, awake: 0 });
      return;
    }

    const totalDeep = logsWithPhases.reduce(
      (sum, log) => sum + (log.sleepPhases.deep || 0),
      0
    );
    const totalLight = logsWithPhases.reduce(
      (sum, log) => sum + (log.sleepPhases.light || 0),
      0
    );
    const totalRem = logsWithPhases.reduce(
      (sum, log) => sum + (log.sleepPhases.rem || 0),
      0
    );
    const totalAwake = logsWithPhases.reduce(
      (sum, log) => sum + (log.sleepPhases.awake || 0),
      0
    );

    setSleepPhases({
      deep: Math.round(totalDeep / logsWithPhases.length),
      light: Math.round(totalLight / logsWithPhases.length),
      rem: Math.round(totalRem / logsWithPhases.length),
      awake: Math.round(totalAwake / logsWithPhases.length),
    });
  };

  // Calculate Sleep Patterns
  const getSleepPatterns = useCallback(() => {
    if (sleepLogs.length === 0) {
      return {
        averageDuration: 0,
        qualityCounts: {},
        sleepScore: 0,
        streak: 0,
        goalAchievement: 0,
        consistency: 0,
        trends: [],
      };
    }

    const totalDuration = sleepLogs.reduce(
      (sum, log) => sum + (parseFloat(log.duration) || 0),
      0
    );
    const averageDuration = (totalDuration / sleepLogs.length).toFixed(1);

    const qualityCounts = sleepLogs.reduce((counts, log) => {
      counts[log.quality] = (counts[log.quality] || 0) + 1;
      return counts;
    }, {});

    const scoreFactors = sleepLogs.slice(-7).map((log) => {
      let score = 0;
      const duration = parseFloat(log.duration);
      if (duration >= 7 && duration <= 9) score += 40;
      else if (duration >= 6 && duration < 7) score += 20;
      if (log.quality === "excellent") score += 30;
      else if (log.quality === "good") score += 20;
      else if (log.quality === "fair") score += 10;
      if (log.mood === "happy" || log.mood === "calm") score += 20;
      else if (log.mood === "neutral") score += 10;
      if (log.heartRate && parseInt(log.heartRate) < 70) score += 10;
      if (log.steps && parseInt(log.steps) > 8000) score += 10;
      return score;
    });
    const sleepScore = scoreFactors.length
      ? Math.round(
          scoreFactors.reduce((sum, s) => sum + s, 0) / scoreFactors.length
        )
      : 0;

    let streak = 0;
    const sortedLogs = [...sleepLogs].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
    let currentDate = new Date();
    for (let log of sortedLogs) {
      const logDate = new Date(log.date);
      const diffDays = Math.floor(
        (currentDate - logDate) / (1000 * 60 * 60 * 24)
      );
      if (diffDays === streak && parseFloat(log.duration) >= sleepGoal) {
        streak++;
      } else if (diffDays > streak) {
        break;
      }
    }

    const goalAchievement = Math.round(
      (sleepLogs.filter((log) => parseFloat(log.duration) >= sleepGoal).length /
        sleepLogs.length) *
        100
    );

    const bedtimes = sleepLogs.map((log) => {
      const [hours, minutes] = log.bedtime.split(":").map(Number);
      return hours * 60 + minutes;
    });
    const avgBedtime = bedtimes.length
      ? bedtimes.reduce((sum, time) => sum + time, 0) / bedtimes.length
      : 0;
    const consistency = bedtimes.length
      ? 100 -
        Math.round(
          (bedtimes.reduce(
            (sum, time) => sum + Math.abs(time - avgBedtime),
            0
          ) /
            bedtimes.length /
            60) *
            20
        )
      : 0;

    const trends = sleepLogs
      .slice(-7)
      .map((log) => ({
        date: log.date,
        duration: parseFloat(log.duration),
        quality: ["poor", "fair", "good", "excellent"].indexOf(log.quality) + 1,
      }))
      .reverse();

    return {
      averageDuration,
      qualityCounts,
      sleepScore,
      streak,
      goalAchievement,
      consistency,
      trends,
    };
  }, [sleepLogs, sleepGoal]);

  // Smartwatch Integration Handlers
  const handleSmartwatchDataSync = (data) => {
    // Convert smartwatch data to sleep logs
    const newLogs = data.map((entry) => ({
      id: Date.now() + Math.random(),
      date: entry.date,
      bedtime: entry.bedtime,
      wakeup: entry.wakeup,
      duration: parseFloat(entry.duration),
      quality: entry.quality,
      mood:
        entry.quality === "excellent"
          ? "happy"
          : entry.quality === "good"
          ? "calm"
          : entry.quality === "fair"
          ? "neutral"
          : "tired",
      notes: `Synced from ${connectedDevice?.name || "smartwatch"}`,
      heartRate: entry.heartRate.avg,
      steps: null,
      sleepPhases: entry.phases,
      deviceData: {
        restingHeartRate: entry.heartRate.resting,
        respiratory: entry.respiratory,
        temperature: entry.bodyTemp,
        oxygenSaturation: entry.spo2,
        movements: entry.movements,
        snoring: entry.snoring,
        interruptions: entry.interruptions,
        sleepScore: entry.sleepScore,
      },
    }));

    // Merge with existing logs (avoid duplicates)
    setSleepLogs((prevLogs) => {
      const existingDates = new Set(prevLogs.map((log) => log.date));
      const uniqueNewLogs = newLogs.filter(
        (log) => !existingDates.has(log.date)
      );
      return [...prevLogs, ...uniqueNewLogs].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );
    });

    setSmartwatchData(data);

    setNotification({
      show: true,
      message: `Successfully synced ${data.length} nights of sleep data!`,
      type: "success",
    });

    setTimeout(
      () => setNotification({ show: false, message: "", type: "" }),
      3000
    );
  };

  const handleDeviceConnected = (device) => {
    setConnectedDevice(device);

    setNotification({
      show: true,
      message: `Connected to ${device.name}!`,
      type: "success",
    });

    setTimeout(
      () => setNotification({ show: false, message: "", type: "" }),
      3000
    );
  };
  // Handle New Sleep Log
  const handleAddSleepLog = () => {
    if (!newSleepLog.date) {
      setNotification({
        show: true,
        message: "Please enter a date for your sleep log.",
        type: "error",
      });
      setTimeout(
        () => setNotification({ show: false, message: "", type: "" }),
        3000
      );
      return;
    }

    if (!newSleepLog.duration) {
      // Calculate duration from bedtime and wakeup
      if (newSleepLog.bedtime && newSleepLog.wakeup) {
        const calculatedDuration = calculateDuration(
          newSleepLog.bedtime,
          newSleepLog.wakeup
        );
        setNewSleepLog((prev) => ({
          ...prev,
          duration: calculatedDuration,
        }));
      } else {
        setNotification({
          show: true,
          message: "Please set both bedtime and wakeup time.",
          type: "error",
        });
        setTimeout(
          () => setNotification({ show: false, message: "", type: "" }),
          3000
        );
        return;
      }
    }

    // Generate mock sleep phases based on duration and quality
    const duration = parseFloat(newSleepLog.duration);
    const qualityMultiplier =
      newSleepLog.quality === "excellent"
        ? 1.2
        : newSleepLog.quality === "good"
        ? 1.0
        : newSleepLog.quality === "fair"
        ? 0.8
        : 0.6;

    const totalMinutes = duration * 60;
    const mockSleepPhases = {
      deep: Math.round(
        totalMinutes * 0.25 * qualityMultiplier * (0.9 + Math.random() * 0.2)
      ),
      light: Math.round(totalMinutes * 0.45 * (0.9 + Math.random() * 0.2)),
      rem: Math.round(
        totalMinutes * 0.25 * qualityMultiplier * (0.9 + Math.random() * 0.2)
      ),
      awake: Math.round(
        totalMinutes *
          0.05 *
          (2 - qualityMultiplier) *
          (0.8 + Math.random() * 0.4)
      ),
    };

    const newLog = {
      id: Date.now(),
      ...newSleepLog,
      duration: parseFloat(newSleepLog.duration),
      heartRate: newSleepLog.heartRate ? parseInt(newSleepLog.heartRate) : null,
      steps: newSleepLog.steps ? parseInt(newSleepLog.steps) : null,
      sleepPhases: mockSleepPhases,
    };

    setSleepLogs((prev) => [...prev, newLog]);

    setNotification({
      show: true,
      message: "Sleep log added successfully!",
      type: "success",
    });
    setTimeout(
      () => setNotification({ show: false, message: "", type: "" }),
      3000
    );

    setNewSleepLog({
      date: new Date().toISOString().split("T")[0],
      bedtime: "22:00",
      wakeup: "06:00",
      duration: "",
      quality: "good",
      mood: "happy",
      notes: "",
      heartRate: "",
      steps: "",
    });
  };

  // Edit existing sleep log
  const handleEditSleepLog = (log) => {
    setEditingLog(log);
    setNewSleepLog({
      date: log.date,
      bedtime: log.bedtime,
      wakeup: log.wakeup,
      duration: log.duration.toString(),
      quality: log.quality,
      mood: log.mood,
      notes: log.notes || "",
      heartRate: log.heartRate ? log.heartRate.toString() : "",
      steps: log.steps ? log.steps.toString() : "",
    });
  };

  // Update edited sleep log
  const handleUpdateSleepLog = () => {
    if (!editingLog) return;

    // Generate updated sleep phases based on duration and quality
    const duration = parseFloat(newSleepLog.duration);
    const qualityMultiplier =
      newSleepLog.quality === "excellent"
        ? 1.2
        : newSleepLog.quality === "good"
        ? 1.0
        : newSleepLog.quality === "fair"
        ? 0.8
        : 0.6;

    const totalMinutes = duration * 60;
    const mockSleepPhases = {
      deep: Math.round(
        totalMinutes * 0.25 * qualityMultiplier * (0.9 + Math.random() * 0.2)
      ),
      light: Math.round(totalMinutes * 0.45 * (0.9 + Math.random() * 0.2)),
      rem: Math.round(
        totalMinutes * 0.25 * qualityMultiplier * (0.9 + Math.random() * 0.2)
      ),
      awake: Math.round(
        totalMinutes *
          0.05 *
          (2 - qualityMultiplier) *
          (0.8 + Math.random() * 0.4)
      ),
    };

    const updatedLog = {
      ...editingLog,
      ...newSleepLog,
      duration: parseFloat(newSleepLog.duration),
      heartRate: newSleepLog.heartRate ? parseInt(newSleepLog.heartRate) : null,
      steps: newSleepLog.steps ? parseInt(newSleepLog.steps) : null,
      sleepPhases: mockSleepPhases,
    };

    setSleepLogs((prev) =>
      prev.map((log) => (log.id === editingLog.id ? updatedLog : log))
    );

    setNotification({
      show: true,
      message: "Sleep log updated successfully!",
      type: "success",
    });
    setTimeout(
      () => setNotification({ show: false, message: "", type: "" }),
      3000
    );

    setEditingLog(null);
    setNewSleepLog({
      date: new Date().toISOString().split("T")[0],
      bedtime: "22:00",
      wakeup: "06:00",
      duration: "",
      quality: "good",
      mood: "happy",
      notes: "",
      heartRate: "",
      steps: "",
    });
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingLog(null);
    setNewSleepLog({
      date: new Date().toISOString().split("T")[0],
      bedtime: "22:00",
      wakeup: "06:00",
      duration: "",
      quality: "good",
      mood: "happy",
      notes: "",
      heartRate: "",
      steps: "",
    });
  };

  // Delete Sleep Log
  const deleteSleepLog = (logId) => {
    setSleepLogs(sleepLogs.filter((log) => log.id !== logId));

    setNotification({
      show: true,
      message: "Sleep log deleted successfully",
      type: "success",
    });
    setTimeout(
      () => setNotification({ show: false, message: "", type: "" }),
      3000
    );
  };

  // Save Settings
const handleSaveSettings = async () => {
  setShowSaved(true);
  setTimeout(() => setShowSaved(false), 2000);

  if (reminderEnabled) {
    await requestPermission(setNotification);
    // Schedule notification (simplified client-side scheduling)
    const now = new Date();
    const [hours, minutes] = reminderTime.split(':').map(Number);
    const reminderDate = new Date();
    reminderDate.setHours(hours, minutes, 0, 0);

    // If reminder time is in the past today, schedule for tomorrow
    if (reminderDate < now) {
      reminderDate.setDate(reminderDate.getDate() + 1);
    }

    const timeUntilReminder = reminderDate.getTime() - now.getTime();
    
    setTimeout(() => {
      if (reminderEnabled) {
        const notification = new Notification('Bedtime Reminder', {
          body: `It's ${reminderTime}! Time to prepare for bed to meet your ${sleepGoal}-hour sleep goal.`,
          icon: '/favicon.ico'
        });
      }
    }, timeUntilReminder);
  }

  setNotification({
    show: true,
    message: 'Settings saved successfully!',
    type: 'success'
  });
  setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000);
};

  // Toggle Expanded Tips
  const toggleTipDetails = (tipId) => {
    if (expandedTip === tipId) {
      setExpandedTip(null);
    } else {
      setExpandedTip(tipId);
    }
  };

  // Toggle Expanded Device
  const toggleDeviceDetails = (deviceId) => {
    if (expandedDevice === deviceId) {
      setExpandedDevice(null);
    } else {
      setExpandedDevice(deviceId);
    }
  };

  // Export Logs as CSV
  const exportLogs = () => {
    const headers =
      "Date,Bedtime,Wakeup,Duration,Quality,Mood,HeartRate,Steps,DeepSleep,LightSleep,REMSleep,Awake,Notes\n";
    const csv = sleepLogs
      .map((log) => {
        const deep = log.sleepPhases?.deep || "";
        const light = log.sleepPhases?.light || "";
        const rem = log.sleepPhases?.rem || "";
        const awake = log.sleepPhases?.awake || "";

        return `${log.date},${log.bedtime},${log.wakeup},${log.duration},${
          log.quality
        },${log.mood},${log.heartRate || ""},${
          log.steps || ""
        },${deep},${light},${rem},${awake},"${
          log.notes ? log.notes.replace(/"/g, '""') : ""
        }"`;
      })
      .join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    saveAs(blob, "sleep_logs.csv");

    setNotification({
      show: true,
      message: "Sleep data exported successfully",
      type: "success",
    });
    setTimeout(
      () => setNotification({ show: false, message: "", type: "" }),
      3000
    );
  };

  // Simulate Device Data Integration
  const fetchDeviceData = useCallback(async () => {
    try {
      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const mockDeviceData = {
        lastSync: new Date().toLocaleString(),
        heartRateAvg: Math.floor(Math.random() * 10) + 60, // 60-69
        sleepStages: {
          deep: Math.floor(Math.random() * 60) + 90, // 90-150 minutes
          light: Math.floor(Math.random() * 60) + 210, // 210-270 minutes
          rem: Math.floor(Math.random() * 30) + 90, // 90-120 minutes
          awake: Math.floor(Math.random() * 15) + 5, // 5-20 minutes
        },
        restingHeartRate: Math.floor(Math.random() * 8) + 58, // 58-65
        respiratory: Math.floor(Math.random() * 3) + 14, // 14-16
        temperature: (Math.random() * 0.5 + 36.5).toFixed(1), // 36.5-37.0
        oxygenSaturation: Math.floor(Math.random() * 3) + 96, // 96-98
      };

      setDeviceData(mockDeviceData);

      setNotification({
        show: true,
        message: "Device synchronized successfully!",
        type: "success",
      });

      setTimeout(() => {
        setNotification({ show: false, message: "", type: "" });
      }, 3000);

      return mockDeviceData;
    } catch (error) {
      console.error("Failed to fetch device data:", error);

      setNotification({
        show: true,
        message: "Device synchronization failed. Please try again.",
        type: "error",
      });

      setTimeout(() => {
        setNotification({ show: false, message: "", type: "" });
      }, 3000);

      return null;
    }
  }, []);

  // Import Device Data
  const importDeviceData = async () => {
    const data = await fetchDeviceData();

    if (data) {
      const totalDuration =
        (data.sleepStages.deep +
          data.sleepStages.light +
          data.sleepStages.rem +
          data.sleepStages.awake) /
        60;

      // Determine quality based on sleep architecture
      let quality = "good";
      const deepPct =
        data.sleepStages.deep /
        (data.sleepStages.deep + data.sleepStages.light + data.sleepStages.rem);
      const awakePct =
        data.sleepStages.awake /
        (data.sleepStages.deep +
          data.sleepStages.light +
          data.sleepStages.rem +
          data.sleepStages.awake);

      if (deepPct > 0.3 && awakePct < 0.05) quality = "excellent";
      else if (deepPct < 0.15 || awakePct > 0.15) quality = "poor";
      else if (deepPct < 0.2 || awakePct > 0.1) quality = "fair";

      // Calculate bedtime and wakeup based on current time and duration
      const now = new Date();
      const wakeupTime = new Date(now);
      wakeupTime.setHours(7);
      wakeupTime.setMinutes(0);

      const bedTime = new Date(wakeupTime);
      bedTime.setHours(bedTime.getHours() - Math.floor(totalDuration));
      bedTime.setMinutes(
        bedTime.getMinutes() - Math.round((totalDuration % 1) * 60)
      );

      const formatTime = (date) => {
        return `${String(date.getHours()).padStart(2, "0")}:${String(
          date.getMinutes()
        ).padStart(2, "0")}`;
      };

      const newLog = {
        id: Date.now(),
        date: new Date().toISOString().split("T")[0],
        bedtime: formatTime(bedTime),
        wakeup: formatTime(wakeupTime),
        duration: totalDuration.toFixed(1),
        quality,
        mood:
          quality === "excellent"
            ? "happy"
            : quality === "good"
            ? "calm"
            : quality === "fair"
            ? "neutral"
            : "tired",
        notes: "Imported from wearable device",
        heartRate: data.heartRateAvg,
        steps: null,
        sleepPhases: data.sleepStages,
        deviceData: {
          restingHeartRate: data.restingHeartRate,
          respiratory: data.respiratory,
          temperature: data.temperature,
          oxygenSaturation: data.oxygenSaturation,
        },
      };

      setSleepLogs((prev) => [...prev, newLog]);
    }
  };

  // Filter and Sort Logs
  const filteredLogs = useMemo(() => {
    return sleepLogs
      .filter((log) => filterQuality === "all" || log.quality === filterQuality)
      .sort((a, b) => {
        switch (sortOption) {
          case "date-desc":
            return new Date(b.date) - new Date(a.date);
          case "date-asc":
            return new Date(a.date) - new Date(b.date);
          case "duration-desc":
            return b.duration - a.duration;
          case "duration-asc":
            return a.duration - b.duration;
          case "quality-desc":
            return (
              ["poor", "fair", "good", "excellent"].indexOf(b.quality) -
              ["poor", "fair", "good", "excellent"].indexOf(a.quality)
            );
          default:
            return 0;
        }
      });
  }, [sleepLogs, filterQuality, sortOption]);

  // Get filtered tips
  const filteredTips = useMemo(() => {
    return sleepTips.filter(
      (tip) =>
        activeTipCategory === "all" ||
        (activeTipCategory === "critical" && tip.critical) ||
        tip.category === activeTipCategory
    );
  }, [activeTipCategory]);

  // Get sleep pattern metrics
  const {
    averageDuration,
    qualityCounts,
    sleepScore,
    streak,
    goalAchievement,
    consistency,
    trends,
  } = getSleepPatterns();
  return (
    <div className={`sleep-tracker ${darkMode ? "dark" : "light"}`}>
      {/* Notification Toast */}
      {notification.show && (
        <div className={`notification ${notification.type}`}>
          <span className="notification-message">{notification.message}</span>
        </div>
      )}

      <header className="header">
        <h1>Sleep Tracker</h1>
        <div className="header-actions">
          <button
            onClick={() => setDarkMode(!darkMode)}
            aria-label={
              darkMode ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {darkMode ? "Light Mode ☀️" : "Dark Mode 🌙"}
          </button>
          <button onClick={exportLogs} aria-label="Export sleep logs">
            Export Data 📤
          </button>
          <button onClick={importDeviceData} aria-label="Sync wearable device">
            Sync Device 📱
          </button>
        </div>
      </header>

      {/* Main Navigation */}
      <div className="sleep-nav">
        {navigationTabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="nav-icon">{tab.icon}</span>
            {tab.name}
          </button>
        ))}
      </div>

      {/* Dashboard View */}
      {activeTab === "dashboard" && (
        <section className="dashboard">
          <div className="dashboard-summary">
            <div className="summary-card">
              <h3>Sleep Score</h3>
              <div className="score-circle">
                <span className="score-value">{sleepScore}</span>
              </div>
              <p
                className={
                  sleepScore >= 80
                    ? "excellent"
                    : sleepScore >= 70
                    ? "good"
                    : sleepScore >= 60
                    ? "fair"
                    : "poor"
                }
              >
                {sleepScore >= 80
                  ? "Excellent"
                  : sleepScore >= 70
                  ? "Good"
                  : sleepScore >= 60
                  ? "Fair"
                  : "Needs Improvement"}
              </p>
            </div>

            <div className="summary-card">
              <h3>Sleep Duration</h3>
              <div className="duration-container">
                <span className="duration-value">{averageDuration}</span>
                <span className="duration-unit">hours</span>
              </div>
              <div className="goal-comparison">
                <div className="goal-meter">
                  <div
                    className="goal-progress"
                    style={{
                      width: `${Math.min(
                        (parseFloat(averageDuration) / sleepGoal) * 100,
                        100
                      )}%`,
                    }}
                  ></div>
                </div>
                <p>Goal: {sleepGoal} hours</p>
              </div>
            </div>

            <div className="summary-card">
              <h3>Consistency</h3>
              <div className="score-circle">
                <span className="score-value">{consistency}%</span>
              </div>
              <p
                className={
                  consistency >= 80
                    ? "excellent"
                    : consistency >= 70
                    ? "good"
                    : consistency >= 60
                    ? "fair"
                    : "poor"
                }
              >
                {consistency >= 80
                  ? "Excellent"
                  : consistency >= 70
                  ? "Good"
                  : consistency >= 60
                  ? "Fair"
                  : "Inconsistent"}
              </p>
            </div>

            <div className="summary-card">
              <h3>Weekly Progress</h3>
              <div className="score-circle">
                <span className="score-value">{weeklyGoalProgress}%</span>
              </div>
              <p
                className={
                  weeklyGoalProgress >= 80
                    ? "excellent"
                    : weeklyGoalProgress >= 60
                    ? "good"
                    : weeklyGoalProgress >= 40
                    ? "fair"
                    : "poor"
                }
              >
                Goal days: {Math.round((weeklyGoalProgress / 100) * 7)} of 7
              </p>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="dashboard-card chart-card">
              <h3>Sleep Trends</h3>
              {trends.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart
                    data={trends}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={darkMode ? "#444" : "#e5e7eb"}
                    />
                    <XAxis
                      dataKey="date"
                      stroke={darkMode ? "#aaa" : "#6b7280"}
                    />
                    <YAxis stroke={darkMode ? "#aaa" : "#6b7280"} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: darkMode ? "#333" : "#fff",
                        borderColor: darkMode ? "#555" : "#e5e7eb",
                        color: darkMode ? "#f0f0f0" : "#333",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="duration"
                      stroke="#3b82f6"
                      fill="url(#colorDuration)"
                      name="Duration (hours)"
                      strokeWidth={2}
                    />
                    <defs>
                      <linearGradient
                        id="colorDuration"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#3b82f6"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#3b82f6"
                          stopOpacity={0.1}
                        />
                      </linearGradient>
                    </defs>
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="no-data">
                  No sleep data available. Add sleep logs to see trends.
                </p>
              )}
            </div>

            <div className="dashboard-card sleep-phases-card">
              <h3>Sleep Phases</h3>
              {sleepPhases.deep > 0 ||
              sleepPhases.light > 0 ||
              sleepPhases.rem > 0 ? (
                <div className="sleep-phases-container">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={[
                          {
                            name: "Deep",
                            value: sleepPhases.deep,
                            label: "Deep",
                          },
                          {
                            name: "Light",
                            value: sleepPhases.light,
                            label: "Light",
                          },
                          { name: "REM", value: sleepPhases.rem, label: "REM" },
                          {
                            name: "Awake",
                            value: sleepPhases.awake,
                            label: "Awake",
                          },
                        ]}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        label
                      >
                        <Cell key="deep" fill="#1e40af" />
                        <Cell key="light" fill="#60a5fa" />
                        <Cell key="rem" fill="#93c5fd" />
                        <Cell key="awake" fill="#dbeafe" />
                      </Pie>
                      <Tooltip
                        formatter={(value) => [`${value} min`, ""]}
                        contentStyle={{
                          backgroundColor: darkMode ? "#333" : "#fff",
                          borderColor: darkMode ? "#555" : "#e5e7eb",
                          color: darkMode ? "#f0f0f0" : "#333",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="phases-legend">
                    <div className="legend-item">
                      <span className="legend-color deep"></span>
                      <span>Deep: {sleepPhases.deep} min</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-color light"></span>
                      <span>Light: {sleepPhases.light} min</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-color rem"></span>
                      <span>REM: {sleepPhases.rem} min</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-color awake"></span>
                      <span>Awake: {sleepPhases.awake} min</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="no-data">
                  No sleep phase data available. Sync with a compatible device.
                </p>
              )}
            </div>

            <div className="dashboard-card">
              <h3>Sleep Settings</h3>
              <div className="settings-grid">
                <div className="setting-item">
                  <span className="setting-label">Sleep Goal</span>
                  <div className="setting-control">
                    <input
                      type="number"
                      step="0.5"
                      min="4"
                      max="12"
                      value={sleepGoal}
                      onChange={(e) =>
                        setSleepGoal(parseFloat(e.target.value) || 8)
                      }
                      aria-label="Set sleep goal in hours"
                    />
                    <span className="setting-unit">hours</span>
                  </div>
                </div>
                <div className="setting-item">
                  <span className="setting-label">Reminder Time</span>
                  <div className="setting-control">
                    <input
                      type="time"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      aria-label="Set bedtime reminder time"
                      disabled={!reminderEnabled}
                    />
                  </div>
                </div>
                <div className="setting-item">
                  <span className="setting-label">Reminders</span>
                  <div className="setting-control">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={reminderEnabled}
                        onChange={(e) => setReminderEnabled(e.target.checked)}
                        aria-label="Enable bedtime reminders"
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
                <button className="save-settings" onClick={handleSaveSettings}>
                  Save Settings
                </button>
              </div>
              {showSaved && <p className="saved-message">Settings Saved! ✅</p>}
            </div>

            <div className="dashboard-card">
              <h3>Smartwatch Status</h3>
              <div className="smartwatch-status">
                {connectedDevice ? (
                  <>
                    <div className="status-row">
                      <span className="status-indicator connected"></span>
                      <span className="status-text">
                        Connected: {connectedDevice.name}
                      </span>
                    </div>
                    <button
                      className="quick-sync-button"
                      onClick={() => setActiveTab("smartwatch")}
                    >
                      Go to Smartwatch Settings
                    </button>
                  </>
                ) : (
                  <>
                    <div className="status-row">
                      <span className="status-indicator disconnected"></span>
                      <span className="status-text">No device connected</span>
                    </div>
                    <button
                      className="connect-device-button"
                      onClick={() => setActiveTab("smartwatch")}
                    >
                      Connect Smartwatch
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
      {/* Sleep Log Form */}
      {activeTab === "logs" && !editingLog && (
        <section className="sleep-log-form">
          <h2>Log Your Sleep</h2>
          <div className="form-grid">
            <label>
              Date
              <input
                type="date"
                value={newSleepLog.date}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, date: e.target.value })
                }
              />
            </label>
            <label>
              Bedtime
              <input
                type="time"
                value={newSleepLog.bedtime}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, bedtime: e.target.value })
                }
              />
            </label>
            <label>
              Wake-up Time
              <input
                type="time"
                value={newSleepLog.wakeup}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, wakeup: e.target.value })
                }
              />
            </label>
            <label>
              Duration (hours)
              <input
                type="number"
                step="0.1"
                placeholder="e.g., 7.5"
                value={newSleepLog.duration}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, duration: e.target.value })
                }
              />
            </label>
            <label>
              Quality
              <select
                value={newSleepLog.quality}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, quality: e.target.value })
                }
              >
                <option value="excellent">Excellent</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
              </select>
            </label>
            <label>
              Mood
              <select
                value={newSleepLog.mood}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, mood: e.target.value })
                }
              >
                <option value="happy">Happy</option>
                <option value="calm">Calm</option>
                <option value="neutral">Neutral</option>
                <option value="tired">Tired</option>
                <option value="stressed">Stressed</option>
              </select>
            </label>
            <label>
              Heart Rate (bpm)
              <input
                type="number"
                placeholder="e.g., 65"
                value={newSleepLog.heartRate}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, heartRate: e.target.value })
                }
              />
            </label>
            <label>
              Steps Taken
              <input
                type="number"
                placeholder="e.g., 10000"
                value={newSleepLog.steps}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, steps: e.target.value })
                }
              />
            </label>
            <label className="full-width">
              Notes
              <textarea
                placeholder="Add any observations or notes"
                value={newSleepLog.notes}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, notes: e.target.value })
                }
              />
            </label>
            <button className="full-width" onClick={handleAddSleepLog}>
              Save Log
            </button>
          </div>
        </section>
      )}

      {/* Edit Log Form */}
      {activeTab === "logs" && editingLog && (
        <section className="sleep-log-form">
          <div className="form-header">
            <h2>Edit Sleep Log</h2>
            <button className="cancel-button" onClick={handleCancelEdit}>
              Cancel
            </button>
          </div>
          <div className="form-grid">
            <label>
              Date
              <input
                type="date"
                value={newSleepLog.date}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, date: e.target.value })
                }
              />
            </label>
            <label>
              Bedtime
              <input
                type="time"
                value={newSleepLog.bedtime}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, bedtime: e.target.value })
                }
              />
            </label>
            <label>
              Wake-up Time
              <input
                type="time"
                value={newSleepLog.wakeup}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, wakeup: e.target.value })
                }
              />
            </label>
            <label>
              Duration (hours)
              <input
                type="number"
                step="0.1"
                placeholder="e.g., 7.5"
                value={newSleepLog.duration}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, duration: e.target.value })
                }
              />
            </label>
            <label>
              Quality
              <select
                value={newSleepLog.quality}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, quality: e.target.value })
                }
              >
                <option value="excellent">Excellent</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
              </select>
            </label>
            <label>
              Mood
              <select
                value={newSleepLog.mood}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, mood: e.target.value })
                }
              >
                <option value="happy">Happy</option>
                <option value="calm">Calm</option>
                <option value="neutral">Neutral</option>
                <option value="tired">Tired</option>
                <option value="stressed">Stressed</option>
              </select>
            </label>
            <label>
              Heart Rate (bpm)
              <input
                type="number"
                placeholder="e.g., 65"
                value={newSleepLog.heartRate}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, heartRate: e.target.value })
                }
              />
            </label>
            <label>
              Steps Taken
              <input
                type="number"
                placeholder="e.g., 10000"
                value={newSleepLog.steps}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, steps: e.target.value })
                }
              />
            </label>
            <label className="full-width">
              Notes
              <textarea
                placeholder="Add any observations or notes"
                value={newSleepLog.notes}
                onChange={(e) =>
                  setNewSleepLog({ ...newSleepLog, notes: e.target.value })
                }
              />
            </label>
            <button className="full-width" onClick={handleUpdateSleepLog}>
              Update Log
            </button>
          </div>
        </section>
      )}

      {/* Sleep Logs list */}
      {activeTab === "logs" && (
        <section className="sleep-logs">
          <h2>Sleep History</h2>
          <div className="filter-sort">
            <label>
              Filter Quality
              <select
                value={filterQuality}
                onChange={(e) => setFilterQuality(e.target.value)}
              >
                <option value="all">All Quality Levels</option>
                <option value="excellent">Excellent</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
              </select>
            </label>
            <label>
              Sort By
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
              >
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="duration-desc">Longest First</option>
                <option value="duration-asc">Shortest First</option>
                <option value="quality-desc">Best Quality First</option>
              </select>
            </label>
          </div>
          <div className="logs-grid">
            {filteredLogs.length === 0 ? (
              <p className="no-logs">
                No sleep logs match your criteria. Try adjusting your filters or
                add new sleep logs.
              </p>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className={`log-card ${log.quality} ${
                    log.deviceData ? "has-device-data" : ""
                  }`}
                >
                  <div className="log-header">
                    <h3>{log.date}</h3>
                    {log.deviceData && (
                      <span
                        className="device-badge"
                        title="Synced from smartwatch"
                      >
                        ⌚ Smartwatch
                      </span>
                    )}
                    <div className="log-actions">
                      <button
                        className="edit-button"
                        onClick={() => handleEditSleepLog(log)}
                        aria-label={`Edit sleep log for ${log.date}`}
                      >
                        Edit
                      </button>
                      <button
                        className="delete-button"
                        onClick={() => deleteSleepLog(log.id)}
                        aria-label={`Delete sleep log for ${log.date}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="log-duration">
                    <span className="duration-value">{log.duration}</span>
                    <span className="duration-unit">hours</span>
                    <span className={`quality-tag ${log.quality}`}>
                      {log.quality}
                    </span>
                    {log.deviceData?.sleepScore && (
                      <span className="sleep-score-badge">
                        Score: {log.deviceData.sleepScore}
                      </span>
                    )}
                  </div>

                  <div className="log-times">
                    <p>
                      <span className="log-label">Bedtime:</span> {log.bedtime}
                    </p>
                    <p>
                      <span className="log-label">Wake-up:</span> {log.wakeup}
                    </p>
                  </div>

                  <div className="log-details">
                    <p>
                      <span className="log-label">Mood:</span>{" "}
                      {log.mood.charAt(0).toUpperCase() + log.mood.slice(1)}
                    </p>
                    {log.heartRate && (
                      <p>
                        <span className="log-label">Heart Rate:</span>{" "}
                        {log.heartRate} bpm
                      </p>
                    )}
                    {log.steps && (
                      <p>
                        <span className="log-label">Steps:</span>{" "}
                        {log.steps.toLocaleString()}
                      </p>
                    )}
                  </div>

                  {log.sleepPhases && (
                    <div className="log-phases">
                      <span className="log-label">Sleep Phases:</span>
                      <div className="phases-bar">
                        <div
                          className="phase deep"
                          style={{
                            width: `${
                              (log.sleepPhases.deep /
                                (log.sleepPhases.deep +
                                  log.sleepPhases.light +
                                  log.sleepPhases.rem +
                                  log.sleepPhases.awake)) *
                              100
                            }%`,
                          }}
                          title={`Deep: ${log.sleepPhases.deep} min`}
                        ></div>
                        <div
                          className="phase light"
                          style={{
                            width: `${
                              (log.sleepPhases.light /
                                (log.sleepPhases.deep +
                                  log.sleepPhases.light +
                                  log.sleepPhases.rem +
                                  log.sleepPhases.awake)) *
                              100
                            }%`,
                          }}
                          title={`Light: ${log.sleepPhases.light} min`}
                        ></div>
                        <div
                          className="phase rem"
                          style={{
                            width: `${
                              (log.sleepPhases.rem /
                                (log.sleepPhases.deep +
                                  log.sleepPhases.light +
                                  log.sleepPhases.rem +
                                  log.sleepPhases.awake)) *
                              100
                            }%`,
                          }}
                          title={`REM: ${log.sleepPhases.rem} min`}
                        ></div>
                        <div
                          className="phase awake"
                          style={{
                            width: `${
                              (log.sleepPhases.awake /
                                (log.sleepPhases.deep +
                                  log.sleepPhases.light +
                                  log.sleepPhases.rem +
                                  log.sleepPhases.awake)) *
                              100
                            }%`,
                          }}
                          title={`Awake: ${log.sleepPhases.awake} min`}
                        ></div>
                      </div>
                    </div>
                  )}

                  {log.deviceData && (
                    <div className="device-data-section">
                      <h4>Health Metrics</h4>
                      <div className="health-metrics-grid">
                        {log.deviceData.restingHeartRate && (
                          <div className="metric">
                            <span className="metric-icon">❤️</span>
                            <span className="metric-value">
                              {log.deviceData.restingHeartRate}
                            </span>
                            <span className="metric-label">Resting HR</span>
                          </div>
                        )}
                        {log.deviceData.respiratory && (
                          <div className="metric">
                            <span className="metric-icon">🫁</span>
                            <span className="metric-value">
                              {log.deviceData.respiratory}
                            </span>
                            <span className="metric-label">Resp Rate</span>
                          </div>
                        )}
                        {log.deviceData.temperature && (
                          <div className="metric">
                            <span className="metric-icon">🌡️</span>
                            <span className="metric-value">
                              {log.deviceData.temperature}°C
                            </span>
                            <span className="metric-label">Body Temp</span>
                          </div>
                        )}
                        {log.deviceData.oxygenSaturation && (
                          <div className="metric">
                            <span className="metric-icon">💨</span>
                            <span className="metric-value">
                              {log.deviceData.oxygenSaturation}%
                            </span>
                            <span className="metric-label">SpO2</span>
                          </div>
                        )}
                        {log.deviceData.movements !== undefined && (
                          <div className="metric">
                            <span className="metric-icon">🔄</span>
                            <span className="metric-value">
                              {log.deviceData.movements}
                            </span>
                            <span className="metric-label">Movements</span>
                          </div>
                        )}
                        {log.deviceData.snoring !== undefined &&
                          log.deviceData.snoring > 0 && (
                            <div className="metric">
                              <span className="metric-icon">💤</span>
                              <span className="metric-value">
                                {log.deviceData.snoring}min
                              </span>
                              <span className="metric-label">Snoring</span>
                            </div>
                          )}
                      </div>
                    </div>
                  )}

                  {log.notes && <p className="log-notes">{log.notes}</p>}
                </div>
              ))
            )}
          </div>
        </section>
      )}
      {/* Analytics Section */}
      {activeTab === "analytics" && (
        <section className="sleep-analytics">
          <h2>Sleep Analytics</h2>

          <div className="analytics-cards">
            <div className="analytics-card">
              <h3>Average Duration</h3>
              <p className="analytics-value">
                {averageDuration} <span className="analytics-unit">hours</span>
              </p>
              <span
                className={averageDuration >= sleepGoal ? "success" : "warning"}
              >
                {averageDuration >= sleepGoal ? "On Target" : "Below Target"}
              </span>
            </div>
            <div className="analytics-card">
              <h3>Sleep Score</h3>
              <p className="analytics-value">
                {sleepScore}
                <span className="analytics-unit">/100</span>
              </p>
              <span
                className={
                  sleepScore >= 80
                    ? "success"
                    : sleepScore >= 60
                    ? "neutral"
                    : "warning"
                }
              >
                {sleepScore >= 80
                  ? "Outstanding"
                  : sleepScore >= 60
                  ? "Satisfactory"
                  : "Needs Improvement"}
              </span>
            </div>
            <div className="analytics-card">
              <h3>Consistency</h3>
              <p className="analytics-value">
                {consistency}
                <span className="analytics-unit">%</span>
              </p>
              <span className={consistency >= 80 ? "success" : "warning"}>
                {consistency >= 80 ? "Highly Consistent" : "Inconsistent"}
              </span>
            </div>
            <div className="analytics-card">
              <h3>Streak</h3>
              <p className="analytics-value">
                {streak} <span className="analytics-unit">days</span>
              </p>
              <span className={streak > 3 ? "success" : "neutral"}>
                {streak > 3 ? "Great Streak" : "Building Momentum"}
              </span>
            </div>
            <div className="analytics-card">
              <h3>Goal Achievement</h3>
              <p className="analytics-value">
                {goalAchievement}
                <span className="analytics-unit">%</span>
              </p>
              <span className={goalAchievement >= 80 ? "success" : "warning"}>
                {goalAchievement >= 80
                  ? "Excellent Progress"
                  : "Room for Improvement"}
              </span>
            </div>
            <div className="analytics-card">
              <h3>Weekly Trend</h3>
              <p className="analytics-value">
                {sleepTrends.improving ? "↗️" : "↘️"}
                <span className="analytics-unit">
                  {sleepTrends.weeklyAvg} hours
                </span>
              </p>
              <span className={sleepTrends.improving ? "success" : "warning"}>
                {sleepTrends.improving ? "Improving" : "Declining"}
              </span>
            </div>
          </div>

          <div className="analytics-charts">
            <div className="chart-container full-width">
              <h3>Weekly Sleep Duration</h3>
              {trends.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart
                    data={trends}
                    margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="date" stroke="#666" />
                    <YAxis stroke="#666" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#fff",
                        borderColor: "#e0e0e0",
                        color: "#333",
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="duration"
                      stroke="#3b82f6"
                      fill="url(#colorDuration)"
                      name="Duration (hours)"
                      activeDot={{ r: 8 }}
                      strokeWidth={2}
                    />
                    <defs>
                      <linearGradient
                        id="colorDuration"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#3b82f6"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#3b82f6"
                          stopOpacity={0.1}
                        />
                      </linearGradient>
                    </defs>
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="no-data">
                  No sleep data available yet. Add sleep logs to see trends.
                </p>
              )}
            </div>

            <div className="chart-container">
              <h3>Sleep Quality Distribution</h3>
              <div className="quality-distribution">
                <div className="quality-bar">
                  <div
                    className="quality-segment excellent"
                    style={{
                      width: `${
                        ((qualityCounts.excellent || 0) / sleepLogs.length) *
                        100
                      }%`,
                    }}
                  >
                    {qualityCounts.excellent || 0}
                  </div>
                  <div
                    className="quality-segment good"
                    style={{
                      width: `${
                        ((qualityCounts.good || 0) / sleepLogs.length) * 100
                      }%`,
                    }}
                  >
                    {qualityCounts.good || 0}
                  </div>
                  <div
                    className="quality-segment fair"
                    style={{
                      width: `${
                        ((qualityCounts.fair || 0) / sleepLogs.length) * 100
                      }%`,
                    }}
                  >
                    {qualityCounts.fair || 0}
                  </div>
                  <div
                    className="quality-segment poor"
                    style={{
                      width: `${
                        ((qualityCounts.poor || 0) / sleepLogs.length) * 100
                      }%`,
                    }}
                  >
                    {qualityCounts.poor || 0}
                  </div>
                </div>
                <div className="quality-legend">
                  <div className="legend-item">
                    <span className="legend-color excellent"></span>
                    <span>Excellent</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color good"></span>
                    <span>Good</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color fair"></span>
                    <span>Fair</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color poor"></span>
                    <span>Poor</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="analytics-insights">
            <h3>Insights & Recommendations</h3>
            <div className="insights-grid">
              <div className="insight-card">
                <h4>Sleep Duration</h4>
                <p>
                  {parseFloat(averageDuration) >= sleepGoal
                    ? `Great job reaching your sleep goal of ${sleepGoal} hours! Consistent sleep duration helps maintain optimal health and cognitive function.`
                    : `You're averaging ${averageDuration} hours of sleep, which is ${(
                        sleepGoal - parseFloat(averageDuration)
                      ).toFixed(
                        1
                      )} hours below your goal of ${sleepGoal} hours. Consider going to bed ${(
                        sleepGoal - parseFloat(averageDuration)
                      ).toFixed(1)} hours earlier to reach your target.`}
                </p>
              </div>

              <div className="insight-card">
                <h4>Sleep Quality</h4>
                <p>
                  {qualityCounts.excellent &&
                  qualityCounts.excellent / sleepLogs.length > 0.5
                    ? "You're experiencing excellent sleep quality often! Continue your current routines to maintain this pattern."
                    : "To improve sleep quality, consider optimizing your sleep environment, reducing screen time before bed, and maintaining a consistent sleep schedule."}
                </p>
              </div>

              <div className="insight-card">
                <h4>Sleep Consistency</h4>
                <p>
                  {consistency >= 80
                    ? "Your sleep schedule is highly consistent, which helps optimize your circadian rhythm and overall sleep quality."
                    : "Your bedtime varies significantly. Try to maintain a more consistent sleep schedule, even on weekends, to improve sleep quality and feel more rested."}
                </p>
              </div>

              <div className="insight-card">
                <h4>Sleep Architecture</h4>
                <p>
                  {sleepPhases.deep > 0
                    ? sleepPhases.deep < 60
                      ? "Your deep sleep duration is lower than optimal. Focus on factors that enhance deep sleep: exercise during the day, limiting alcohol, and reducing stress."
                      : "Your deep sleep percentage is healthy. This stage is critical for physical recovery and immune function."
                    : "Start tracking sleep phases with a compatible device to get insights into your sleep architecture."}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Sleep Tips */}
      {activeTab === "tips" && (
        <section className="sleep-tips">
          <h2>Sleep Better Tips</h2>

          <div className="category-filters">
            {tipCategories.map((category) => (
              <button
                key={category.id}
                className={activeTipCategory === category.id ? "active" : ""}
                onClick={() => setActiveTipCategory(category.id)}
              >
                {category.icon} {category.name}
              </button>
            ))}
          </div>

          <div className="tips-grid">
            {filteredTips.map((tip) => (
              <div
                key={tip.id}
                className={`tip-card ${tip.critical ? "critical" : ""}`}
              >
                <div className="tip-header">
                  <span className="tip-icon">{tip.icon}</span>
                  <div className="tip-title-container">
                    <h3>{tip.title}</h3>
                    {tip.critical && (
                      <span className="critical-tag">Critical</span>
                    )}
                  </div>
                </div>
                <p className="tip-description">{tip.description}</p>

                {expandedTip === tip.id && (
                  <div className="tip-details">
                    <div className="detail-item">
                      <span className="detail-label">Recommended</span>
                      <p>{tip.details.recommended}</p>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Avoid</span>
                      <p>{tip.details.avoid}</p>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Pro Tip</span>
                      <p>{tip.details.tip}</p>
                    </div>
                  </div>
                )}

                <button
                  className="expand-button"
                  onClick={() => toggleTipDetails(tip.id)}
                >
                  {expandedTip === tip.id ? "Show Less" : "Show Details"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {/* Sleep Devices */}
      {activeTab === "devices" && (
        <section className="sleep-devices">
          <h2>Sleep Tracking Devices</h2>

          <div className="devices-header">
            <p>
              Enhance your sleep tracking with these recommended devices that
              integrate with SleepWell.
            </p>
            <div className="health-connections">
              <h3>Health Connections</h3>
              <div className="connection-toggles">
                <label className="connection-toggle">
                  <span>Step Tracking</span>
                  <div className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={healthConnections.steps}
                      onChange={() =>
                        setHealthConnections({
                          ...healthConnections,
                          steps: !healthConnections.steps,
                        })
                      }
                    />
                    <span className="toggle-slider"></span>
                  </div>
                </label>
                <label className="connection-toggle">
                  <span>Heart Rate</span>
                  <div className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={healthConnections.heartRate}
                      onChange={() =>
                        setHealthConnections({
                          ...healthConnections,
                          heartRate: !healthConnections.heartRate,
                        })
                      }
                    />
                    <span className="toggle-slider"></span>
                  </div>
                </label>
                <label className="connection-toggle">
                  <span>Stress Levels</span>
                  <div className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={healthConnections.stress}
                      onChange={() =>
                        setHealthConnections({
                          ...healthConnections,
                          stress: !healthConnections.stress,
                        })
                      }
                    />
                    <span className="toggle-slider"></span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="devices-grid">
            {recommendedDevices.map((device) => (
              <div
                key={device.id}
                className={`device-card ${
                  expandedDevice === device.id ? "expanded" : ""
                }`}
              >
                <div className="device-header">
                  <h3>{device.name}</h3>
                  <span className="device-category">{device.category}</span>
                </div>
                <p className="device-description">{device.description}</p>

                {expandedDevice === device.id && (
                  <div className="device-details">
                    <p className="device-detail-description">
                      {device.details}
                    </p>
                    <h4>Key Features</h4>
                    <ul className="device-features">
                      {device.features.map((feature, index) => (
                        <li key={index}>{feature}</li>
                      ))}
                    </ul>
                    <div className="device-price-rating">
                      <span className="device-price">{device.price}</span>
                      <span className="device-rating">
                        {"★".repeat(Math.floor(device.rating))}
                        {"☆".repeat(5 - Math.floor(device.rating))}
                        <span className="rating-value">({device.rating})</span>
                      </span>
                    </div>
                  </div>
                )}

                <div className="device-footer">
                  <button
                    className="device-details-button"
                    onClick={() => toggleDeviceDetails(device.id)}
                  >
                    {expandedDevice === device.id
                      ? "Show Less"
                      : "Show Details"}
                  </button>
                  <a
                    href={device.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="device-link"
                  >
                    Learn More
                  </a>
                </div>
              </div>
            ))}
          </div>

          <div className="device-sync-section">
            <h3>Device Sync Status</h3>
            {deviceData ? (
              <div className="sync-details">
                <p>
                  <span className="sync-label">Last Synced:</span>{" "}
                  {deviceData.lastSync}
                </p>
                <div className="sync-stats">
                  <div className="sync-stat">
                    <span className="sync-stat-label">Heart Rate Avg</span>
                    <span className="sync-stat-value">
                      {deviceData.heartRateAvg} bpm
                    </span>
                  </div>
                  <div className="sync-stat">
                    <span className="sync-stat-label">Resting Heart Rate</span>
                    <span className="sync-stat-value">
                      {deviceData.restingHeartRate} bpm
                    </span>
                  </div>
                  <div className="sync-stat">
                    <span className="sync-stat-label">Respiratory Rate</span>
                    <span className="sync-stat-value">
                      {deviceData.respiratory} bpm
                    </span>
                  </div>
                  <div className="sync-stat">
                    <span className="sync-stat-label">Body Temperature</span>
                    <span className="sync-stat-value">
                      {deviceData.temperature}°C
                    </span>
                  </div>
                  <div className="sync-stat">
                    <span className="sync-stat-label">Oxygen Saturation</span>
                    <span className="sync-stat-value">
                      {deviceData.oxygenSaturation}%
                    </span>
                  </div>
                </div>
                <button className="sync-now-button" onClick={importDeviceData}>
                  Sync Again
                </button>
              </div>
            ) : (
              <div className="no-sync">
                <p>
                  No device data available. Click the button below to sync your
                  wearable device.
                </p>
                <button className="sync-now-button" onClick={importDeviceData}>
                  Sync Device
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Smartwatch Integration */}
      {activeTab === "smartwatch" && (
        <section className="smartwatch-section">
          <h2>Smartwatch Integration</h2>

          <SmartwatchSetup
            onDeviceConnected={handleDeviceConnected}
            onDataSync={handleSmartwatchDataSync}
          />

          {smartwatchData && smartwatchData.length > 0 && (
            <SmartSleepAnalysis
              sleepData={smartwatchData}
              realtimeData={null}
            />
          )}

          {connectedDevice && (
            <div className="smartwatch-features">
              <h3>Advanced Features</h3>

              <div className="feature-cards">
                <div className="feature-card">
                  <h4>Smart Alarm</h4>
                  <p>
                    Wake up during your lightest sleep phase within a 30-minute
                    window for a more refreshed morning.
                  </p>
                  <button className="feature-button">
                    Configure Smart Alarm
                  </button>
                </div>

                <div className="feature-card">
                  <h4>Sleep Coaching</h4>
                  <p>
                    Get personalized recommendations based on your sleep
                    patterns and health metrics.
                  </p>
                  <button className="feature-button">View Coaching Tips</button>
                </div>

                <div className="feature-card">
                  <h4>Health Correlations</h4>
                  <p>
                    See how your daily activities, heart rate, and stress levels
                    affect your sleep quality.
                  </p>
                  <button className="feature-button">View Correlations</button>
                </div>

                <div className="feature-card">
                  <h4>Export Health Data</h4>
                  <p>
                    Export comprehensive sleep and health data for sharing with
                    healthcare providers.
                  </p>
                  <button className="feature-button">Export Data</button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default SleepTracker;
