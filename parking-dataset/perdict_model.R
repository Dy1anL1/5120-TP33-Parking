library(xgboost)
library(caret)
library(dplyr)

# read data
train <- read.csv("parking_train.csv")
test <- read.csv("parking_test.csv")
test_labels <- read.csv("parking_results_for_comparison.csv")

train$Status_Description <- NULL

# Convert to factor, save levels, convert to integer
train_factors <- train %>%
  select(-status) %>%
  mutate(across(where(is.character), as.factor))

factor_levels <- list()
char_cols <- sapply(train_factors, is.factor)
for (col in names(train_factors)[char_cols]) {
  factor_levels[[col]] <- levels(train_factors[[col]])
}
saveRDS(factor_levels, "factor_levels.rds")

train_numeric <- train_factors %>%
  mutate(across(where(is.factor), as.integer))

train_matrix <- as.matrix(train_numeric)
train_label <- train$status

# Read levels, convert to factor, convert to integer
factor_levels <- readRDS("factor_levels.rds")

for (col in names(factor_levels)) {
  if (col %in% names(test)) {
    test[[col]] <- factor(test[[col]], levels = factor_levels[[col]])
  }
}

test_numeric <- test %>%
  mutate(across(where(is.factor), as.integer))

test_matrix <- as.matrix(test_numeric)

# convert to dmatrix
dtrain <- xgb.DMatrix(data = train_matrix, label = train_label)
dtest <- xgb.DMatrix(data = test_matrix)

# training model
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

xgb.save(fin.mod, "parking_model.xgb")



# model accuracy evaluation
pred_prob <- predict(fin.mod, dtest)
pred_class <- ifelse(pred_prob > 0.5, 1, 0)
confusionMatrix(as.factor(pred_class), as.factor(test_labels$status))
