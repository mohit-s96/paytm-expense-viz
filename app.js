const setParsingError = () => {
  document.getElementById("erroMsg").style.display = "flex";
};
const resetParsingError = () => {
  document.getElementById("erroMsg").style.display = "none";
};
const render = (rawData = []) => {
  resetParsingError();
  if (!rawData?.length) rawData = [];
  let chartFilter = null; // Active chart filter state

  const isValidDate = (dateObject) =>
    new Date(dateObject).toString() !== "Invalid Date";

  const preprocessData = (data) => {
    let year = new Date().getFullYear();
    let flag = false;
    let add = 0;
    return data.map((entry) => {
      if (entry.date[0].month === 1 && !flag) {
        flag = true;
      }
      if (entry.date[0].month === 12 && flag) {
        add--;
        flag = false;
      }
      return {
        date: new Date(
          entry.date[0].year || year + add,
          entry.date[0].month - 1,
          entry.date[0].date
        ),
        payee: entry.details,
        amount: entry.amount.float * entry.amount.sign,
        bank: entry.bankName,
        note: entry.note,
        upiRefNum: entry.upiRefNumber?.float,
      };
    });
  };

  let expenses = preprocessData(rawData);

  const totalExpenses = expenses.reduce((acc, entry) => acc + entry.amount, 0);
  document.getElementById("totalExpenses").textContent = totalExpenses;

  // Populate Filters
  const payeeFilter = document.getElementById("payeeFilter");
  new Set(
    [{ payee: "Not Selected" }].concat(expenses).map((e) => e.payee)
  ).forEach((payee) => {
    const option = document.createElement("option");
    option.value = payee;
    option.text = payee;
    payeeFilter.appendChild(option);
  });

  // Initialize Table
  const table = new Tabulator("#expenseTable", {
    data: expenses,
    columns: [
      {
        title: "Date",
        field: "date",
        formatter: "datetime",
        sorter: "datetime",
      },
      { title: "Payee", field: "payee" },
      { title: "Amount", field: "amount", sorter: "number" },
      { title: "Bank", field: "bank" },
      { title: "Note", field: "note" },
      { title: "UPI Ref No.", field: "upiRefNum" },
    ],
    layout: "fitData",
    pagination: "local",
    paginationSize: 15,
  });

  // Charts
  const barChartCnv = document.getElementById("expenseBarChart");
  const pieChartCnv = document.getElementById("expensePieChart");
  const barChartCtx = barChartCnv.getContext("2d");
  const pieChartCtx = pieChartCnv.getContext("2d");

  barChartCtx.clearRect(0, 0, barChartCnv.width, barChartCnv.height);
  pieChartCtx.clearRect(0, 0, pieChartCnv.width, pieChartCnv.height);

  let barChart = new Chart(barChartCtx, {
    type: "bar",
    data: { labels: [], datasets: [] },
    options: {
      onClick: (e) => {
        const points = barChart.getElementsAtEventForMode(
          e,
          "nearest",
          { intersect: true },
          true
        );
        if (points.length) {
          const label = barChart.data.labels[points[0].index];
          chartFilter = { type: "month", value: label };
          applyFilters();
        }
      },
    },
  });

  let pieChart = new Chart(pieChartCtx, {
    type: "pie",
    data: { labels: [], datasets: [] },
    options: {
      plugins: {
        legend: {
          display: false, // Disable the legend
        },
      },
      onClick: (e) => {
        const points = pieChart.getElementsAtEventForMode(
          e,
          "nearest",
          { intersect: true },
          true
        );
        if (points.length) {
          const label = pieChart.data.labels[points[0].index];
          chartFilter = { type: "payee", value: label };
          applyFilters();
        }
      },
    },
  });

  // Update Chart Data
  function updateCharts(data) {
    const monthlyData = {};
    const payeeData = {};

    data.forEach((entry) => {
      const month = entry.date.toLocaleString("default", {
        month: "long",
        year: "numeric",
      });
      monthlyData[month] = (monthlyData[month] || 0) + entry.amount;

      payeeData[entry.payee] = (payeeData[entry.payee] || 0) + entry.amount;
    });

    barChart.data.labels = Object.keys(monthlyData);
    barChart.data.datasets = [
      {
        label: "Monthly Expenses",
        data: Object.values(monthlyData),
        backgroundColor: "rgba(75, 192, 192, 0.2)",
        borderColor: "rgba(75, 192, 192, 1)",
        borderWidth: 1,
      },
    ];
    barChart.update();

    pieChart.data.labels = Object.keys(payeeData);
    pieChart.data.datasets = [
      {
        data: Object.values(payeeData),
        backgroundColor: [
          "#ff6384", // Pink-Red
          "#36a2eb", // Light Blue
          "#ffce56", // Yellow
          "#4bc0c0", // Teal
          "#9966ff", // Purple
          "#ff9f40", // Orange
          "#c9cbcf", // Light Gray
          "#1f77b4", // Deep Blue
          "#2ca02c", // Green
          "#d62728", // Dark Red
        ],
      },
    ];
    pieChart.update();
  }

  // Toggle Charts
  const updateTable = (data) => {
    table.replaceData(data);
  };
  // Apply Filters
  function applyFilters() {
    const startDate = new Date(document.getElementById("startDate").value);
    const endDate = new Date(document.getElementById("endDate").value);
    const payee = document.getElementById("payeeFilter").value;

    const invalidDates = !(isValidDate(startDate) && isValidDate(endDate));
    let filteredData = expenses.filter((entry) => {
      const inDateRange = invalidDates
        ? true
        : entry.date >= startDate && entry.date <= endDate;
      const matchesPayee =
        !payee || payee === "Not Selected" || entry.payee === payee;
      return inDateRange && matchesPayee;
    });

    if (chartFilter) {
      if (chartFilter.type === "month") {
        filteredData = filteredData.filter(
          (entry) =>
            entry.date.toLocaleString("default", {
              month: "long",
              year: "numeric",
            }) === chartFilter.value
        );
      } else if (chartFilter.type === "payee") {
        filteredData = filteredData.filter(
          (entry) => entry.payee === chartFilter.value
        );
      }
    }

    updateTable(filteredData);
    updateCharts(filteredData);
  }

  function toggleChart(type) {
    document
      .getElementById("barChartIcon")
      .classList.toggle("active", type === "bar");
    document
      .getElementById("pieChartIcon")
      .classList.toggle("active", type === "pie");

    document.getElementById("expenseBarChart").style.display =
      type === "bar" ? "block" : "none";
    document.getElementById("expensePieChart").style.display =
      type === "pie" ? "block" : "none";
  }

  // Reset Chart Filters
  function resetChartFilters() {
    chartFilter = null;
    document.getElementById("startDate").value = null;
    document.getElementById("endDate").value = null;
    document.getElementById("payeeFilter").value = "Not Selected";
    updateTable(expenses);
    updateCharts(expenses);
  }

  function downloadAsJSON() {
    if (!rawData?.length) return;
    const blob = new Blob([JSON.stringify(rawData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "paytm-expenses-parsed.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  window.resetChartFilters = resetChartFilters;
  window.toggleChart = toggleChart;
  window.applyFilters = applyFilters;
  window.downloadAsJSON = downloadAsJSON;

  // Initialize
  updateTable(expenses);
  updateCharts(expenses);
};
