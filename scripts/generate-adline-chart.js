const yahooFinance = require('yahoo-finance2').default;
const fs = require('fs');

async function getADLine(ticker, months = 3) {
  const now = new Date();
  const past = new Date();
  past.setMonth(now.getMonth() - months);

  const history = await yahooFinance.historical(ticker, {
    period1: past,
    period2: now,
    interval: '1d',
  });

  let adLine = 0;
  const chartData = {
    dates: [],
    adValues: [],
    sentiments: [],
  };

  for (const day of history) {
    const { high, low, close, volume, date } = day;
    if (!high || !low || high === low) continue;

    const mfMultiplier = (close - low - (high - close)) / (high - low);
    const mfVolume = mfMultiplier * volume;
    adLine += mfVolume;

    chartData.dates.push(date.toISOString().split('T')[0]);
    chartData.adValues.push(parseFloat(adLine.toFixed(2)));
    chartData.sentiments.push(
      mfMultiplier > 0 ? 'Buy' : mfMultiplier < 0 ? 'Sell' : 'Neutral',
    );
  }

  return chartData;
}

async function generateChartHTML(ticker) {
  const data = await getADLine(ticker, 3);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${ticker} - A/D Line Chart</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <h2>${ticker} - Accumulation/Distribution Line (Last 3 Months)</h2>
  <canvas id="adChart" width="1000" height="400"></canvas>
  <script>
    const ctx = document.getElementById('adChart').getContext('2d');
    const adChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(data.dates)},
        datasets: [{
          label: 'A/D Line',
          data: ${JSON.stringify(data.adValues)},
          borderColor: 'blue',
          fill: false,
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        plugins: {
          tooltip: {
            callbacks: {
              afterLabel: function(context) {
                return "Sentiment: ${JSON.stringify(data.sentiments)}"[context.dataIndex];
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Date'
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'A/D Value'
            }
          }
        }
      }
    });
  </script>
</body>
</html>
`;

  fs.writeFileSync('adline-chart.html', html);
  console.log('✅ Chart saved to adline-chart.html');
}

generateChartHTML('AAPL');
