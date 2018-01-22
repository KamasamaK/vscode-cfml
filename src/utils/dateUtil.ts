/**
 * Gets the current date as a formatted string
 *
 * @return Formatted date
 */
function getCurrentDateFormatted(): string {
  const currDate = new Date();

  const year: string = currDate.getFullYear().toString();
  let month: string = (currDate.getMonth() + 1).toString();
  month = (month.length === 1) ? "0" + month : month;
  let day: string = currDate.getDate().toString();
  day = (day.length === 1) ? "0" + day : day;

  return year + "-" + month + "-" + day;
}

/**
 * Gets the current time as a formatted string
 *
 * @return Formatted time
 */
function getCurrentTimeFormatted(includeMilliseconds: boolean = false): string {
  const currDate = new Date();

  let hours: string = currDate.getHours().toString();
  hours = (hours.length === 1) ? "0" + hours : hours;
  let minutes: string = currDate.getMinutes().toString();
  minutes = (minutes.length === 1) ? "0" + minutes : minutes;
  let seconds: string = currDate.getSeconds().toString();
  seconds = (seconds.length === 1) ? "0" + seconds : seconds;

  let formattedTime: string = hours + ":" + minutes + ":" + seconds;
  if (includeMilliseconds) {
      let milliseconds: string = currDate.getMilliseconds().toString();
      while (milliseconds.length < 3) {
          milliseconds = "0" + milliseconds;
      }
      formattedTime += "." + milliseconds;
  }

  return formattedTime;
}

/**
 * Gets the current datetime as a formatted string
 *
 * @return Formatted datetime
 */
export function getCurrentDateTimeFormatted(): string {
  return getCurrentDateFormatted() + " " + getCurrentTimeFormatted();
}
