library(xgboost)
library(caret)
library(dplyr)

train <- read.csv("parking_train.csv")
test <- read.csv("parking_test.csv")

test_labels <- read.csv("parking_results_for_comparison.csv")


train$Status_Description <- NULL

train_numeric <- train %>%
  select(-status) %>%
  mutate(across(where(is.character), as.factor)) %>%
  mutate(across(where(is.factor), as.integer))

train_matrix <- as.matrix(train_numeric)
train_label <- train$status

test_numeric <- test %>%
  mutate(across(where(is.character), as.factor)) %>%
  mutate(across(where(is.factor), as.integer))

test_matrix <- as.matrix(test_numeric)

# Change the data into the format required by xgboost
dtrain <- xgb.DMatrix(data = train_matrix, label = train_label)
dtest <- xgb.DMatrix(data = test_matrix)


set.seed(222)

fin.mod <- xgb.train(
  data = dtrain,
  params = list(
    objective = "binary:logistic",
    eta = 0.03,
    max_depth = 6,
    subsample = 0.8,
    colsample_bytree = 0.8
  ),
  nrounds = 100,
  watchlist = list(train = dtrain),
  verbose = 1
)


pred_prob <- predict(fin.mod, test_matrix)
pred_class <- ifelse(pred_prob > 0.5, 1, 0)


confusionMatrix(as.factor(pred_class), as.factor(test_labels$status))

