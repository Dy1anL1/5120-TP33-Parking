library(lubridate)
library(dplyr)
library(tidyr)

sensor <- read.csv("on-street-parking-bay-sensors.csv")
bay <- read.csv("on-street-parking-bays.csv")
street <- read.csv("parking-zones-linked-to-street-segments.csv")

# clean sensor data
sensor$Lastupdated <- NULL

# change time format
sensor_time <- sensor %>%
  mutate(
    status_time = ymd_hms(sensor$Status_Timestamp, tz = "Australia/Melbourne")
  ) %>%
  arrange(desc(status_time)) %>%
  mutate(
    year = year(status_time),
    month = month(status_time),
    day = day(status_time),
    hour = hour(status_time),
    timeminute = minute(status_time),
    second = second(status_time),
    wday = wday(status_time, label = TRUE),
    is_weekend = wday(status_time) %in% c(1,7)
  )

# useless column
sensor_time$Status_Timestamp <- NULL
sensor_time$status_time <- NULL

# seperate location
sensor_time <- sensor_time %>%
  separate(Location, into = c("latitude", "longitude"), sep = ", ", convert = TRUE)


# clean bay data
bay$Latitude <- NULL
bay$Longitude <- NULL
bay$Location <- NULL
bay$LastUpdated <- NULL





sensor_time <- sensor_time %>%
  mutate(KerbsideID = as.character(KerbsideID))

bay <- bay %>%
  mutate(KerbsideID = as.character(KerbsideID))

sensor_bay <- sensor_time %>%
  left_join(bay, by = "KerbsideID")



