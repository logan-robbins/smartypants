var app = WebApplication.Create(args);
app.MapGet("/cart/{id}", (string id) => id);
app.Run();
