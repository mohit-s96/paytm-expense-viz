document
  .getElementById("pdfUpload")
  .addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        const pdfJson = {
          numPages: pdf.numPages,
          pages: [],
        };

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const viewport = page.getViewport({ scale: 1.0 });

          const pageText = textContent.items.map((item) => ({
            text: item.str,
            transform: item.transform,
            width: item.width,
            height: item.height,
          }));

          pdfJson.pages.push({
            pageNumber: pageNum,
            width: viewport.width,
            height: viewport.height,
            text: pageText,
          });
        }
        render(parseJson(pdfJson));
      } catch (error) {
        console.error("PDF conversion error:", error);
        setParsingError();
      }
    };

    fileReader.readAsArrayBuffer(file);
  });

document.getElementById("jsonImport").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const fileReader = new FileReader();
  fileReader.readAsText(file);
  fileReader.onload = (e) => {
    try {
      const rawData = JSON.parse(e.target.result);
      render(rawData);
    } catch (error) {
      console.error("JSON parsing error:", error);
      setParsingError();
    }
  };
});

const parseJson = (json) => {
  const strings = json.pages
    .flatMap((x) => x.text)
    .map((x) => decodeURIComponent(x.text))
    .filter((y) => y.trim().length);

  const startData = strings.findIndex((x) => x === "Amount") + 1;

  const results = [];

  for (let i = startData; i < strings.length; i++) {
    if (shouldSkipString(strings[i])) continue;
    const result = getRow();
    columnMeta.forEach((column) => {
      if (i >= strings.length) return;
      if (column.value === "note") {
        const d = parseDate(strings[i]);
        if ((d[0]?.date && d[0]?.month) || shouldSkipString(strings[i])) {
          i--;
          return;
        }
      }
      let parsed = column.parser(strings[i]);
      if (typeof column.consume === "function") {
        while (column.consume(strings[++i])) {
          if (i < strings.length) parsed += column.parser(strings[i]);
        }
        if (column.value === "note") {
          const d = parseDate(strings[i]);
          if ((d[0]?.date && d[0]?.month) || shouldSkipString(strings[i])) {
            i--;
          }
        }
      } else {
        i += column.consume;
      }
      result[column.value] = parsed;
    });
    results.push(result);
  }
  return results?.map((x) => {
    Object.keys(x).forEach((curr) => {
      if (x[curr]?.float) {
        delete x[curr].lastProcessedIdx;
      }
    });
    return x;
  });
};

const pageBreakRegex = /^Page \d+ of \d+$/;

const skipStrings = new Set([
  "Date & Time",
  "Transaction Details",
  "Your Account",
  "Amount",
  "For any queries",
  "Contact Us",
]);

const shouldSkipString = (str) => {
  return skipStrings.has(str) || pageBreakRegex.test(str);
};

const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const parseFloatAndSign = (str) => {
  const signPresent = str[0] === "-" ? 1 : 0;
  let float = "";
  let decimal = false;
  let parsingNum = false;
  for (let i = signPresent; i < str.length; i++) {
    if (str[i] === ",") continue;
    if (str[i] === ".") {
      if (!parsingNum) continue;
      if (decimal)
        return {
          float: parseFloat(float),
          sign: signPresent ? -1 : 1,
          lastProcessedIdx: i,
        };
      decimal = true;
      float += ".";
    } else if (!Number.isNaN(parseInt(str[i]))) {
      parsingNum = true;
      float += str[i];
    } else {
      if (parsingNum) {
        return {
          float: parseFloat(float),
          sign: signPresent ? -1 : 1,
          lastProcessedIdx: i,
        };
      }
    }
  }
  return {
    float: parseFloat(float),
    sign: signPresent ? -1 : 1,
    lastProcessedIdx: str.length - 1,
  };
};

const parseDate = (str) => {
  const dates = [];
  str?.split(" - ").forEach((dateString) => {
    const dateMonthAndYear = {
      date: null,
      month: null,
      year: null,
    };
    const { lastProcessedIdx, float: date } = parseFloatAndSign(dateString);
    if (date) {
      dateMonthAndYear.date = date;
      const { float: year } = parseFloatAndSign(
        dateString.slice(lastProcessedIdx + 1)
      );
      const idx = months.findIndex((x) => dateString.toLowerCase().includes(x));
      if (idx > -1) {
        dateMonthAndYear.month = idx + 1;
      }
      if (year) {
        dateMonthAndYear.year = year;
      }
    }
    dates.push(dateMonthAndYear);
  });
  return dates;
};

const parseTime = (str) => {
  const [timeString, amOrPm] = str.split(" ");
  const add = amOrPm?.toLowerCase() === "pm" ? 12 : 0;
  const [hour, minutes] = timeString?.split(":");
  return {
    hours: +hour + add,
    minutes: +minutes,
  };
};

const identityParser = (str) => str;

const getRow = () => {
  return {
    date: null,
    time: null,
    details: null,
    upiRefNumber: null,
    bankName: null,
    accountLast4Digits: null,
    amount: null,
    note: null,
  };
};

const columnMeta = [
  {
    value: "date",
    label: "Date",
    parser: parseDate,
    consume: 1,
  },
  {
    value: "time",
    label: "Time",
    parser: parseTime,
    consume: 1,
  },
  {
    value: "details",
    label: "Details",
    parser: identityParser,
    consume: (str) => {
      return str && !str?.endsWith(" -");
    },
  },
  {
    value: "bankName",
    label: "Bank Name",
    parser: (str) => str?.slice(0, str.lastIndexOf("-")).trim(),
    consume: 1,
  },
  {
    value: "accountLast4Digits",
    label: "Account (last 4 digits)",
    parser: (str) => identityParser(parseInt(str)),
    consume: 1,
  },
  {
    value: "amount",
    label: "Amount",
    parser: parseFloatAndSign,
    consume: 1,
  },
  {
    value: "upiRefNumber",
    label: "UPI Reference Number",
    parser: parseFloatAndSign,
    consume: 1,
  },
  {
    value: "note",
    label: "Note",
    parser: identityParser,
    consume: (str) => {
      if (!str) return false;
      const d = parseDate(str);
      return (
        !(d[0]?.date && d[0]?.month) &&
        str !== "Note:" &&
        !shouldSkipString(str)
      );
    },
  },
];
