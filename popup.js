// Guilt Calculator — popup script

const dot = document.getElementById("dot");
const statusText = document.getElementById("statusText");

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs && tabs[0];
  const url = tab && tab.url ? tab.url : "";

  const isSupported = /swiggy\.com|zomato\.com/i.test(url);

  if (isSupported) {
    dot.classList.remove("inactive");
    dot.classList.add("active");
    statusText.textContent = "active on this page";
  } else {
    dot.classList.remove("active");
    dot.classList.add("inactive");
    statusText.textContent = "inactive — visit swiggy.com or zomato.com";
  }
});
