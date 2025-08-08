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

# left join sensor_bay to street by zone id and road segment id
sensor_bay_street <- sensor_bay %>%
  left_join(street, by = c("Zone_Number" = "ParkingZone", "RoadSegmentID" = "Segment_ID"))


# complete the missing road information according to the road description
sensor_bay_street <- sensor_bay_street %>%
  mutate(
    OnStreet = if_else(is.na(OnStreet) | OnStreet == "", 
                       NA_character_, OnStreet),
    StreetFrom = if_else(is.na(StreetFrom) | StreetFrom == "", 
                         NA_character_, StreetFrom),
    StreetTo = if_else(is.na(StreetTo) | StreetTo == "", 
                       NA_character_, StreetTo)
  ) %>%
  extract(
    col = "RoadSegmentDescription",
    into = c("OnStreet_new", "StreetFrom_new", "StreetTo_new"),
    regex = "^(.*?) between (.*?) and (.*)$",
    remove = FALSE
  ) %>%
  mutate(
    OnStreet = if_else(is.na(OnStreet) | OnStreet == "", OnStreet_new, OnStreet),
    StreetFrom = if_else(is.na(StreetFrom) | StreetFrom == "", StreetFrom_new, StreetFrom),
    StreetTo = if_else(is.na(StreetTo) | StreetTo == "", StreetTo_new, StreetTo)
  ) %>%
  select(-OnStreet_new, -StreetFrom_new, -StreetTo_new)

# Remove rows with missing data
parking <- sensor_bay_street %>%
  filter(!(is.na(Zone_Number) | is.na(RoadSegmentID)))


# Start to build model

