Rails.application.routes.draw do
  resources :orders
  get "/health", to: "health#show"
end
